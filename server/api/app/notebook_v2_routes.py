"""New v2 routes only; existing v1 handlers retain their original protocols."""
from fastapi import Cookie, Header, Query, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from .notebook_acl import MAX_VERSION, fail
from .notebook_acl_routes import canonical_uuid
from .notebook_payload import NotebookPayloadPolicy
from .notebook_validation import NotebookValidationWorker
from .notebook_v2 import capabilities, admission_proofs, register_v2, read_state
from .notebook_write_routes import describe_writer
from .notebook_writes_v2 import publish_v2
from .sync import validate_idempotency_key


def install_notebook_v2_routes(app, db):
    settings = app.state.settings
    policy = NotebookPayloadPolicy(settings.blob_dir, settings.sync_max_blob_bytes)

    def checked(*identities, key=None, mutation=False):
        if any(not canonical_uuid(value) for value in identities):
            fail(400, "invalid_notebook_identity", "Canonical UUID resource identities are required")
        if mutation and not validate_idempotency_key(key):
            fail(400, "invalid_idempotency_key", "A stable managed operation identity is required")

    def queries(request, names):
        entries = request.query_params.multi_items()
        if len(entries) != len(names) or set(name for name, _ in entries) != set(names):
            fail(400, "invalid_request", "The exact query identities are required without extra or repeated members")

    def worker():
        value = getattr(app.state, "notebook_validation_worker", None)
        return value if isinstance(value, NotebookValidationWorker) else None

    # Install BEFORE /v1/notebooks/{resource_id}; this literal is not a UUID.
    @app.get("/v1/notebooks/capabilities")
    def capabilities_get(request: Request, dowze_session: str | None = Cookie(default=None), x_dowze_account: str | None = Header(default=None)):
        queries(request, ())
        return capabilities(db, settings, worker(), dowze_session, x_dowze_account, app.state.now)

    @app.get("/v1/notebook-admission-proofs")
    def proof_get(request: Request, space_id: str = Query(max_length=128), note_id: str = Query(max_length=200),
                  canonical_document_id: str = Query(max_length=128), metadata_document_id: str = Query(max_length=128), lineage: str = Query(max_length=200),
                  dowze_session: str | None = Cookie(default=None), x_dowze_account: str | None = Header(default=None)):
        identity = {"space_id": space_id, "note_id": note_id, "canonical_document_id": canonical_document_id, "metadata_document_id": metadata_document_id, "lineage": lineage}
        queries(request, identity)
        return admission_proofs(db, settings, policy, dowze_session, x_dowze_account, identity, app.state.now)

    @app.put("/v1/notebooks/{resource_id}/admission", status_code=201)
    async def admission_put(resource_id: str, request: Request,
                            dowze_session: str | None = Cookie(default=None), x_dowze_account: str | None = Header(default=None),
                            x_csrf_token: str | None = Header(default=None), x_idempotency_key: str | None = Header(default=None)):
        checked(resource_id, key=x_idempotency_key, mutation=True)
        queries(request, ())
        try:
            packet_json = (await request.body()).decode("utf-8", errors="strict")
        except UnicodeError:
            fail(422, "invalid_managed_admission", "The admission packet must be exact UTF-8 JSON")
        status, payload = await run_in_threadpool(register_v2, db, settings, policy, dowze_session, x_dowze_account, x_csrf_token,
            resource_id, packet_json, x_idempotency_key, app.state.now)
        return JSONResponse(payload, status_code=status)

    @app.get("/v1/notebooks/{resource_id}/state")
    def state_get(resource_id: str, request: Request, incarnation: str,
                  resource_version: int = Query(ge=1, le=MAX_VERSION), access_version: int = Query(ge=1, le=MAX_VERSION),
                  dowze_session: str | None = Cookie(default=None), x_dowze_account: str | None = Header(default=None)):
        checked(resource_id, incarnation)
        queries(request, ("incarnation", "resource_version", "access_version"))
        expected = {"incarnation": incarnation, "resource_version": resource_version, "access_version": access_version}
        result = read_state(db, settings, policy, dowze_session, x_dowze_account, resource_id, expected, app.state.now)
        result["resource"] = describe_writer(app, result["resource"])
        return result

    @app.put("/v1/notebooks/{resource_id}/state-v2")
    async def state_put(resource_id: str, request: Request,
                        dowze_session: str | None = Cookie(default=None), x_dowze_account: str | None = Header(default=None),
                        x_csrf_token: str | None = Header(default=None), x_idempotency_key: str | None = Header(default=None)):
        checked(resource_id, key=x_idempotency_key, mutation=True)
        queries(request, ())
        try:
            packet_json = (await request.body()).decode("utf-8", errors="strict")
        except UnicodeError:
            fail(422, "invalid_managed_packet", "The prepared packet must be exact UTF-8 JSON")
        status, payload = await run_in_threadpool(publish_v2, db, settings, policy, worker(), dowze_session, x_dowze_account, x_csrf_token,
            resource_id, packet_json, x_idempotency_key, app.state.now)
        return JSONResponse(payload, status_code=status)
