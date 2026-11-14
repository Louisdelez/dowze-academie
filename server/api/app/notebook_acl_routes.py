"""Explicit opt-in HTTP surface; private space identity always remains private."""
from __future__ import annotations

from typing import Literal
from uuid import UUID

from fastapi import Cookie, Header, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator

from . import notebook_acl as acl
from .sync import validate_idempotency_key, validate_sync_id
from .notebook_payload import NotebookPayloadPolicy


class StrictInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class SourceProof(StrictInput):
    version: int = Field(ge=1, le=acl.MAX_VERSION)
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")


class Registration(StrictInput):
    protocol: Literal["dowze-managed-notebook@1"]
    private_write_policy: Literal["managed-only"]
    space_id: str
    note_id: str = Field(min_length=1, max_length=200)
    canonical_document_id: str
    metadata_document_id: str
    lineage: str = Field(min_length=1, max_length=200)
    canonical: SourceProof
    metadata: SourceProof

    @field_validator("space_id", "canonical_document_id", "metadata_document_id")
    @classmethod
    def valid_sync_identity(cls, value):
        if not validate_sync_id(value):
            raise ValueError("invalid sync identity")
        return value

    @field_validator("note_id", "lineage")
    @classmethod
    def exact_identity(cls, value):
        if any(ord(char) < 32 or 0xD800 <= ord(char) <= 0xDFFF for char in value):
            raise ValueError("unsupported identity")
        return value


class AccessMutation(StrictInput):
    incarnation: str
    base_acl_version: int = Field(ge=1, le=acl.MAX_VERSION)


class Invitation(AccessMutation):
    recipient_account_id: str
    role: Literal["viewer", "commenter", "editor"]
    ttl_seconds: int = Field(ge=60, le=7 * 86400)


class Acceptance(StrictInput):
    incarnation: str
    invitation_version: int = Field(ge=1, le=acl.MAX_VERSION)


def canonical_uuid(value):
    try:
        return str(UUID(value)) == value
    except (ValueError, TypeError, AttributeError):
        return False


def install_notebook_routes(app, db):
    source_policy = NotebookPayloadPolicy(app.state.settings.blob_dir, app.state.settings.sync_max_blob_bytes)
    from .notebook_blobs import install_notebook_blob_routes
    install_notebook_blob_routes(app, db)
    from .notebook_write_routes import install_notebook_write_routes, describe_writer
    install_notebook_write_routes(app, db)
    from .notebook_retention_routes import install_notebook_retention_routes
    install_notebook_retention_routes(app, db)
    def response(status, payload):
        return JSONResponse(describe_writer(app, payload), status_code=status)

    def checked(*identities, key=None, mutation=False):
        if any(not canonical_uuid(value) for value in identities):
            raise acl.NotebookError(400, "invalid_notebook_identity", "Canonical UUID identities are required")
        if mutation and not validate_idempotency_key(key):
            raise acl.NotebookError(400, "invalid_idempotency_key", "A valid idempotency key is required")

    @app.exception_handler(acl.NotebookError)
    async def notebook_failure(_request, error):
        return response(error.status, {"code": error.code, "message": error.message})

    @app.put("/v1/notebooks/{resource_id}", status_code=201)
    def register(resource_id: str, body: Registration,
                 dowze_session: str | None = Cookie(default=None), x_dowze_account: str | None = Header(default=None),
                 x_csrf_token: str | None = Header(default=None), x_idempotency_key: str | None = Header(default=None)):
        checked(resource_id, key=x_idempotency_key, mutation=True)
        return response(*acl.register(db, dowze_session, x_dowze_account, x_csrf_token, resource_id, body.model_dump(), x_idempotency_key, app.state.now, source_policy=source_policy, retention_settings=app.state.settings))

    @app.get("/v1/notebooks/{resource_id}")
    def descriptor(resource_id: str, dowze_session: str | None = Cookie(default=None), x_dowze_account: str | None = Header(default=None)):
        checked(resource_id)
        return describe_writer(app, acl.read(db, dowze_session, x_dowze_account, resource_id, app.state.now, source_policy=source_policy))

    @app.get("/v1/notebooks/{resource_id}/documents")
    def documents(resource_id: str, dowze_session: str | None = Cookie(default=None), x_dowze_account: str | None = Header(default=None)):
        checked(resource_id)
        return describe_writer(app, acl.read(db, dowze_session, x_dowze_account, resource_id, app.state.now, documents=True, source_policy=source_policy))

    @app.put("/v1/notebooks/{resource_id}/invitations/{invitation_id}", status_code=201)
    def invitation(resource_id: str, invitation_id: str, body: Invitation,
                   dowze_session: str | None = Cookie(default=None), x_dowze_account: str | None = Header(default=None),
                   x_csrf_token: str | None = Header(default=None), x_idempotency_key: str | None = Header(default=None)):
        checked(resource_id, invitation_id, body.incarnation, body.recipient_account_id, key=x_idempotency_key, mutation=True)
        return response(*acl.invite(db, dowze_session, x_dowze_account, x_csrf_token, resource_id, invitation_id, body.model_dump(), x_idempotency_key, app.state.now, source_policy=source_policy))

    @app.post("/v1/notebooks/{resource_id}/invitations/{invitation_id}/accept")
    def acceptance(resource_id: str, invitation_id: str, body: Acceptance,
                   dowze_session: str | None = Cookie(default=None), x_dowze_account: str | None = Header(default=None),
                   x_csrf_token: str | None = Header(default=None), x_idempotency_key: str | None = Header(default=None)):
        checked(resource_id, invitation_id, body.incarnation, key=x_idempotency_key, mutation=True)
        return response(*acl.accept(db, dowze_session, x_dowze_account, x_csrf_token, resource_id, invitation_id, body.model_dump(), x_idempotency_key, app.state.now, source_policy=source_policy))

    @app.delete("/v1/notebooks/{resource_id}/grants/{account_id}")
    def revoke_grant(resource_id: str, account_id: str, body: AccessMutation,
                     dowze_session: str | None = Cookie(default=None), x_dowze_account: str | None = Header(default=None),
                     x_csrf_token: str | None = Header(default=None), x_idempotency_key: str | None = Header(default=None)):
        checked(resource_id, account_id, body.incarnation, key=x_idempotency_key, mutation=True)
        return response(*acl.revoke(db, dowze_session, x_dowze_account, x_csrf_token, resource_id, account_id, body.model_dump(), x_idempotency_key, app.state.now, source_policy=source_policy))

    @app.delete("/v1/notebooks/{resource_id}/invitations/{invitation_id}")
    def revoke_invitation(resource_id: str, invitation_id: str, body: AccessMutation,
                          dowze_session: str | None = Cookie(default=None), x_dowze_account: str | None = Header(default=None),
                          x_csrf_token: str | None = Header(default=None), x_idempotency_key: str | None = Header(default=None)):
        checked(resource_id, invitation_id, body.incarnation, key=x_idempotency_key, mutation=True)
        return response(*acl.revoke(db, dowze_session, x_dowze_account, x_csrf_token, resource_id, invitation_id, body.model_dump(), x_idempotency_key, app.state.now, invitation=True, source_policy=source_policy))

    @app.get("/v1/notebook-invitations")
    def pending_invitations(after: str = Query(default="", max_length=36), limit: int = Query(default=100, ge=1, le=100),
                            dowze_session: str | None = Cookie(default=None), x_dowze_account: str | None = Header(default=None)):
        if after:
            checked(after)
        return acl.invitations(db, dowze_session, x_dowze_account, app.state.now, after, limit)
