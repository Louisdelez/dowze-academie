"""Closed lifecycle routes; no implicit delete through the active state writer."""
from fastapi import Cookie, Header, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from .notebook_acl import fail
from .notebook_acl_routes import canonical_uuid
from .notebook_lifecycle import parse_request, trash, restore, read_lifecycle
from .notebook_payload import NotebookPayloadPolicy
from .notebook_validation import NotebookValidationWorker
from .sync import validate_idempotency_key


def install_notebook_lifecycle_routes(app, db):
    settings = app.state.settings
    policy = NotebookPayloadPolicy(settings.blob_dir, settings.sync_max_blob_bytes)

    def checked(resource_id, request, key=None, *, mutation=False):
        if not canonical_uuid(resource_id):
            fail(400, "invalid_notebook_identity", "A canonical resource UUID is required")
        if mutation and not validate_idempotency_key(key):
            fail(400, "invalid_idempotency_key", "A stable lifecycle operation identity is required")
        if mutation and request.query_params:
            fail(400, "invalid_request", "Lifecycle mutations do not accept query members")

    @app.post("/v1/notebooks/{resource_id}/trash")
    async def trash_post(resource_id: str, request: Request,
                         dowze_session: str | None = Cookie(default=None), x_dowze_account: str | None = Header(default=None),
                         x_csrf_token: str | None = Header(default=None), x_idempotency_key: str | None = Header(default=None)):
        checked(resource_id, request, x_idempotency_key, mutation=True)
        body = parse_request(await request.body())
        status, payload = await run_in_threadpool(trash, db, settings, policy, dowze_session, x_dowze_account, x_csrf_token, resource_id, body, x_idempotency_key, app.state.now)
        return JSONResponse(payload, status_code=status)

    @app.post("/v1/notebooks/{resource_id}/restore")
    async def restore_post(resource_id: str, request: Request,
                           dowze_session: str | None = Cookie(default=None), x_dowze_account: str | None = Header(default=None),
                           x_csrf_token: str | None = Header(default=None), x_idempotency_key: str | None = Header(default=None)):
        checked(resource_id, request, x_idempotency_key, mutation=True)
        body = parse_request(await request.body())
        value = getattr(app.state, "notebook_validation_worker", None)
        worker = value if isinstance(value, NotebookValidationWorker) else None
        status, payload = await run_in_threadpool(restore, db, settings, policy, worker, dowze_session, x_dowze_account, x_csrf_token, resource_id, body, x_idempotency_key, app.state.now)
        return JSONResponse(payload, status_code=status)

    @app.get("/v1/notebooks/{resource_id}/lifecycle")
    def lifecycle_get(resource_id: str, request: Request, incarnation: str,
                      dowze_session: str | None = Cookie(default=None), x_dowze_account: str | None = Header(default=None)):
        checked(resource_id, request)
        if not canonical_uuid(incarnation) or list(request.query_params.multi_items()) != [("incarnation", incarnation)]:
            fail(400, "invalid_request", "The exact current incarnation is required")
        return read_lifecycle(db, dowze_session, x_dowze_account, resource_id, incarnation, app.state.now)
