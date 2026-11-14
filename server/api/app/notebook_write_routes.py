"""Explicit managed writer adapter; absence of the real pinned worker fails closed."""
from __future__ import annotations

import json
from typing import Any, Literal

from fastapi import Cookie, Header, Query, Request
from fastapi.responses import JSONResponse
from pydantic import Field, ValidationError
from starlette.concurrency import run_in_threadpool

from .notebook_acl import MAX_VERSION, fail
from .notebook_acl_routes import StrictInput, canonical_uuid
from .notebook_payload import NotebookPayloadPolicy, NotebookPayloadError, _json_text, _json_object, _invalid_constant
from .notebook_validation import NotebookValidationWorker
from .notebook_media_types import managed_upload_content_type
from .notebook_writes import publish, upload
from .sync import validate_idempotency_key


class WriteSource(StrictInput):
    base_version: int = Field(ge=1, le=MAX_VERSION)
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    content: dict[str, Any]


class NotebookState(StrictInput):
    protocol: Literal["dowze-managed-notebook-write@1"]
    incarnation: str
    resource_version: int = Field(ge=1, le=MAX_VERSION)
    writer_version: int = Field(ge=1, le=MAX_VERSION)
    canonical: WriteSource
    metadata: WriteSource


def configure_notebook_writer(app, worker):
    """Trusted startup only, never a request parameter or an HTTP endpoint."""
    if not isinstance(worker, NotebookValidationWorker):
        raise ValueError("The pinned real validator is required")
    app.state.notebook_validation_worker = worker


def describe_writer(app, value):
    if isinstance(value, dict) and "capabilities" in value:
        enabled = isinstance(getattr(app.state, "notebook_validation_worker", None), NotebookValidationWorker)
        value = {**value, "capabilities": {**value["capabilities"], "write_documents": enabled and value["role"] in ("owner", "editor")}}
    return value


def install_notebook_write_routes(app, db):
    settings = app.state.settings
    policy = NotebookPayloadPolicy(settings.blob_dir, settings.sync_max_blob_bytes)
    def checked(resource_id, incarnation, key):
        if not canonical_uuid(resource_id) or not canonical_uuid(incarnation):
            fail(400, "invalid_notebook_identity", "Canonical notebook identities are required")
        if not validate_idempotency_key(key):
            fail(400, "invalid_idempotency_key", "A valid managed operation identity is required")

    @app.put("/v1/notebooks/{resource_id}/state")
    async def state_put(resource_id: str, request: Request,
                        dowze_session: str | None = Cookie(default=None), x_dowze_account: str | None = Header(default=None),
                        x_csrf_token: str | None = Header(default=None), x_idempotency_key: str | None = Header(default=None)):
        try:
            parsed = json.loads(_json_text(await request.body()), object_pairs_hook=_json_object, parse_constant=_invalid_constant)
            body = NotebookState.model_validate(parsed).model_dump()
        except (NotebookPayloadError, ValueError, UnicodeError, RecursionError, ValidationError):
            fail(422, "invalid_notebook_state", "The managed pair must be bounded strict JSON")
        checked(resource_id, body["incarnation"], x_idempotency_key)
        worker = getattr(app.state, "notebook_validation_worker", None)
        status, payload = await run_in_threadpool(publish, db, settings, policy, worker if isinstance(worker, NotebookValidationWorker) else None,
            dowze_session, x_dowze_account, x_csrf_token, resource_id, body, x_idempotency_key, app.state.now)
        return JSONResponse(payload, status_code=status)

    @app.post("/v1/notebooks/{resource_id}/blobs", status_code=201)
    async def blob_post(resource_id: str, request: Request, incarnation: str,
                        resource_version: int = Query(ge=1, le=MAX_VERSION), writer_version: int = Query(ge=1, le=MAX_VERSION),
                        dowze_session: str | None = Cookie(default=None), x_dowze_account: str | None = Header(default=None),
                        x_csrf_token: str | None = Header(default=None), x_idempotency_key: str | None = Header(default=None),
                        x_content_sha256: str | None = Header(default=None)):
        checked(resource_id, incarnation, x_idempotency_key)
        expected = {"incarnation": incarnation, "resource_version": resource_version, "writer_version": writer_version}
        status, payload = await run_in_threadpool(upload, db, settings, dowze_session, x_dowze_account, x_csrf_token, resource_id, expected,
            managed_upload_content_type(request.headers.get("content-type", "")), x_content_sha256 or "", await request.body(), x_idempotency_key, app.state.now)
        return JSONResponse(payload, status_code=status)
