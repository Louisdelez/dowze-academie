"""Owner recovery/export input only, never an automatic overwrite endpoint."""
from fastapi import Cookie, Header, Query
from fastapi.responses import Response

from .notebook_acl import MAX_VERSION, fail
from .notebook_acl_routes import canonical_uuid
from .notebook_payload import NotebookPayloadPolicy, SYNC_ID
from .notebook_retention import read_snapshot


def install_notebook_retention_routes(app, db):
    settings = app.state.settings
    policy = NotebookPayloadPolicy(settings.blob_dir, settings.sync_max_blob_bytes)
    def checked(resource_id, incarnation, blob_id=None):
        if not canonical_uuid(resource_id) or not canonical_uuid(incarnation) or blob_id is not None and not SYNC_ID.fullmatch(blob_id):
            fail(400, "invalid_notebook_identity", "Exact retained source identities are required")

    @app.get("/v1/notebooks/{resource_id}/versions/{canonical_version}/{metadata_version}")
    def snapshot(resource_id: str, incarnation: str, canonical_version: int, metadata_version: int,
                 resource_version: int = Query(ge=1, le=MAX_VERSION),
                 dowze_session: str | None = Cookie(default=None), x_dowze_account: str | None = Header(default=None)):
        checked(resource_id, incarnation)
        if not 1 <= canonical_version <= MAX_VERSION or not 1 <= metadata_version <= MAX_VERSION:
            fail(400, "invalid_notebook_identity", "Positive retained pair versions are required")
        return read_snapshot(db, settings, policy, dowze_session, x_dowze_account, resource_id, canonical_version, metadata_version,
            {"incarnation": incarnation, "resource_version": resource_version}, app.state.now)

    @app.get("/v1/notebooks/{resource_id}/versions/{canonical_version}/{metadata_version}/blobs/{blob_id}")
    def blob(resource_id: str, incarnation: str, canonical_version: int, metadata_version: int, blob_id: str,
             resource_version: int = Query(ge=1, le=MAX_VERSION),
             dowze_session: str | None = Cookie(default=None), x_dowze_account: str | None = Header(default=None)):
        checked(resource_id, incarnation, blob_id)
        if not 1 <= canonical_version <= MAX_VERSION or not 1 <= metadata_version <= MAX_VERSION:
            fail(400, "invalid_notebook_identity", "Positive retained pair versions are required")
        value = read_snapshot(db, settings, policy, dowze_session, x_dowze_account, resource_id, canonical_version, metadata_version,
            {"incarnation": incarnation, "resource_version": resource_version}, app.state.now, blob_id=blob_id)
        return Response(value["bytes"], media_type=value["media_type"], headers={"Cache-Control": "no-store", "X-Content-SHA256": value["sha256"]})
