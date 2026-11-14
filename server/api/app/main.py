from __future__ import annotations

import io
import zipfile

import base64
from datetime import datetime, timezone
import hashlib
from pathlib import Path
import re
import time

from fastapi import Cookie, FastAPI, Header, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from .catalog import MAX_PACKAGE_BYTES
from .config import Settings
from .db import Database
from .models import AnnualSpaceInput, Credentials, DocumentInput
from .notebook_acl_routes import install_notebook_routes
from .notebook_v2_routes import install_notebook_v2_routes
from .notebook_lifecycle_routes import install_notebook_lifecycle_routes
from .notebook_wire import MAX_PACKET_BYTES
from .notebook_media_types import managed_upload_content_type
from .security import (
    AccountExists,
    FixedWindowLimiter,
    authenticate,
    create_account,
    create_session,
    get_session,
    rotate_csrf,
    revoke_session,
    verify_csrf,
)
from .sync import (
    DOCUMENT_TYPES,
    create_blob,
    create_space,
    decode_cursor,
    IdempotencyCapacityError,
    delete_blob,
    delete_document,
    get_blob,
    list_changes,
    put_document,
    reconcile_blob_directory,
    validate_idempotency_key,
    validate_sync_id,
)

ID_PATTERN = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$")
VERSION_PATTERN = re.compile(r"^[0-9]+\.[0-9]+\.[0-9]+$")
COOKIE_NAME = "dowze_session"


def error(status: int, code: str, message: str, headers: dict | None = None) -> JSONResponse:
    return JSONResponse({"code": code, "message": message}, status_code=status, headers=headers)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    db = Database(settings.database_path, settings.database_url, settings.database_schema)
    db.initialize()
    reconcile_blob_directory(db, settings.blob_dir)
    app = FastAPI(title="Dowze Academie NAS API", version="0.4.1")
    app.state.settings = settings
    app.state.db = db
    app.state.now = lambda: datetime.now(timezone.utc)
    limiter = FixedWindowLimiter(settings.request_limit_per_minute)
    sync_limiter = FixedWindowLimiter(settings.sync_request_limit_per_minute)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.allowed_origins),
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "X-CSRF-Token", "X-Idempotency-Key", "X-Content-SHA256", "X-Dowze-Account"],
        max_age=600,
    )

    @app.exception_handler(IdempotencyCapacityError)
    async def idempotency_capacity(_request: Request, _exception: IdempotencyCapacityError):
        return error(429, "idempotency_capacity", "Operation history capacity reached")

    @app.exception_handler(RequestValidationError)
    async def validation_error(_request: Request, _exception: RequestValidationError):
        return error(400, "invalid_request", "Request validation failed")

    @app.exception_handler(StarletteHTTPException)
    async def http_error(_request: Request, exception: StarletteHTTPException):
        if exception.status_code == 404:
            return error(404, "not_found", "Resource not found")
        if exception.status_code == 405:
            return error(405, "method_not_allowed", "Method not allowed")
        return error(exception.status_code, "request_failed", "Request failed")

    @app.exception_handler(Exception)
    async def internal_error(_request: Request, _exception: Exception):
        return error(500, "internal_error", "Internal server error")

    @app.middleware("http")
    async def request_guards(request: Request, call_next):
        session = None
        expected_account = request.headers.get("x-dowze-account")
        if expected_account and request.url.path.startswith(("/v1/spaces", "/v1/notebooks", "/v1/notebook-invitations", "/v1/notebook-admission-proofs")):
            session, failure = current_session(request.cookies.get(COOKIE_NAME))
            if failure:
                return failure
            if session["id"] != expected_account:
                return error(409, "session_account_changed", "The active session belongs to another account")
        if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
            origin = request.headers.get("origin")
            if origin not in settings.allowed_origins:
                return error(403, "origin_rejected", "Request origin rejected")
        if request.method in {"POST", "PUT", "PATCH"}:
            is_blob_upload = request.method == "POST" and request.url.path.endswith("/blobs")
            is_document_put = request.method == "PUT" and "/documents/" in request.url.path
            is_managed_pair = request.method == "PUT" and request.url.path.startswith("/v1/notebooks/") and request.url.path.count("/") == 4 and request.url.path.endswith("/state")
            is_managed_pair_v2 = request.method == "PUT" and request.url.path.startswith("/v1/notebooks/") and request.url.path.count("/") == 4 and request.url.path.endswith("/state-v2")
            is_managed_admission_v2 = request.method == "PUT" and request.url.path.startswith("/v1/notebooks/") and request.url.path.count("/") == 4 and request.url.path.endswith("/admission")
            is_managed_lifecycle = request.method == "POST" and request.url.path.startswith("/v1/notebooks/") and request.url.path.count("/") == 4 and request.url.path.endswith(("/trash", "/restore"))
            body_limit = (
                min(settings.max_request_bytes, 4096)
                if is_managed_lifecycle
                else min(4 * settings.sync_max_document_bytes + 65_536, MAX_PACKET_BYTES)
                if is_managed_pair_v2
                else min(settings.max_request_bytes, 65_536)
                if is_managed_admission_v2
                else settings.sync_max_blob_bytes
                if is_blob_upload
                else settings.sync_max_document_bytes * 2 + 65_536
                if is_managed_pair
                else settings.sync_max_document_bytes + 65_536
                if is_document_put
                else settings.max_request_bytes
            )
            declared_length = request.headers.get("content-length")
            if declared_length:
                try:
                    if int(declared_length) > body_limit:
                        if is_blob_upload:
                            return error(413, "blob_too_large", "Blob exceeds size limit")
                        return error(413, "request_too_large", "Request body too large")
                except ValueError:
                    return error(400, "invalid_request", "Request validation failed")
            body = bytearray()
            async for chunk in request.stream():
                body.extend(chunk)
                if len(body) > body_limit:
                    if is_blob_upload:
                        return error(413, "blob_too_large", "Blob exceeds size limit")
                    return error(413, "request_too_large", "Request body too large")
            request._body = bytes(body)
        client = request.client.host if request.client else "unknown"
        if session is None and request.cookies.get(COOKIE_NAME) and request.url.path.startswith('/v1/') and request.url.path not in {'/v1/sessions','/v1/accounts'}:
            session, _ = current_session(request.cookies.get(COOKIE_NAME))
        selected_limiter = sync_limiter if session else limiter
        bucket = session['id'] if session else client
        if not selected_limiter.accept(bucket, time.monotonic()):
            return error(429, "rate_limited", "Too many requests", {"Retry-After": "60"})
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Cache-Control"] = response.headers.get("Cache-Control", "no-store")
        return response

    def current_session(token: str | None):
        session = get_session(db, token, app.state.now())
        if session is None:
            return None, error(401, "invalid_session", "Authentication required")
        return session, None

    def mutation_session(token: str | None, csrf: str | None):
        session, failure = current_session(token)
        if failure:
            return None, failure
        if not verify_csrf(session, csrf):
            return None, error(403, "csrf_rejected", "CSRF validation failed")
        return session, None

    def checked_sync_path(space_id: str, document_type: str | None = None, document_id: str | None = None):
        if not validate_sync_id(space_id):
            return error(404, "not_found", "Resource not found")
        if document_type is not None and document_type not in DOCUMENT_TYPES:
            return error(404, "not_found", "Resource not found")
        if document_id is not None and not validate_sync_id(document_id):
            return error(404, "not_found", "Resource not found")
        return None

    @app.get("/health")
    def health():
        with db.connect() as connection:
            connection.execute("SELECT 1").fetchone()
        return {"status": "ok"}

    @app.post("/v1/accounts", status_code=201)
    def account_create(credentials: Credentials):
        try:
            return create_account(db, str(credentials.email), credentials.password, app.state.now())
        except AccountExists:
            return error(409, "account_exists", "Account already exists")

    @app.post("/v1/sessions", status_code=201)
    def session_create(credentials: Credentials, response: Response):
        account = authenticate(db, str(credentials.email), credentials.password)
        if account is None:
            return error(401, "invalid_credentials", "Authentication failed")
        session = create_session(db, account["id"], app.state.now(), settings.session_ttl_seconds)
        response.set_cookie(
            COOKIE_NAME,
            session["token"],
            max_age=settings.session_ttl_seconds,
            path="/",
            secure=settings.secure_cookies,
            httponly=True,
            samesite="strict",
        )
        return {"expires_at": session["expires_at"], "csrf_token": session["csrf_token"]}

    @app.get("/v1/me")
    def me(dowze_session: str | None = Cookie(default=None)):
        session, failure = current_session(dowze_session)
        if failure:
            return failure
        return {"id": session["id"], "email": session["email"], "created_at": session["created_at"]}

    @app.get("/v1/csrf")
    def csrf_get(dowze_session: str | None = Cookie(default=None)):
        session, failure = current_session(dowze_session)
        if failure:
            return failure
        return {"csrf_token": rotate_csrf(db, session["session_id"])}

    @app.delete("/v1/sessions", status_code=204)
    def session_delete(
        dowze_session: str | None = Cookie(default=None),
        x_csrf_token: str | None = Header(default=None),
    ):
        session, failure = current_session(dowze_session)
        if failure:
            return failure
        if not verify_csrf(session, x_csrf_token):
            return error(403, "csrf_rejected", "CSRF validation failed")
        revoke_session(db, session["session_id"], app.state.now())
        response = Response(status_code=204)
        response.delete_cookie(
            COOKIE_NAME,
            path="/",
            secure=settings.secure_cookies,
            httponly=True,
            samesite="strict",
        )
        return response

    @app.get("/v1/catalog")
    def catalog_list():
        return {"items": db.list_catalog()[:100]}

    def package_record(formation_id: str, version: str):
        if not ID_PATTERN.fullmatch(formation_id) or not VERSION_PATTERN.fullmatch(version):
            return None
        return db.get_package(formation_id, version)

    @app.get("/v1/catalog/{formation_id}/{version}/manifest")
    def manifest_get(formation_id: str, version: str):
        record = package_record(formation_id, version)
        if record is None:
            return error(404, "not_found", "Resource not found")
        return record["manifest"]

    @app.get("/v1/catalog/{formation_id}/{version}/package")
    def package_get(formation_id: str, version: str):
        record = package_record(formation_id, version)
        if record is None:
            return error(404, "not_found", "Resource not found")
        path = settings.package_dir / record["stored_path"]
        try:
            resolved = path.resolve(strict=True)
            package_root = settings.package_dir.resolve(strict=True)
            if resolved.parent != package_root or not resolved.is_file():
                return error(404, "not_found", "Resource not found")
            expected_size = record["package_size"]
            if not 0 < expected_size <= MAX_PACKAGE_BYTES:
                return error(503, "package_unavailable", "Package integrity check failed")
            if resolved.stat().st_size != expected_size:
                return error(503, "package_unavailable", "Package integrity check failed")
            with resolved.open("rb") as package_file:
                body = package_file.read(expected_size + 1)
        except OSError:
            return error(404, "not_found", "Resource not found")
        digest = hashlib.sha256(body).hexdigest()
        if len(body) != record["package_size"] or digest != record["package_sha256"]:
            return error(503, "package_unavailable", "Package integrity check failed")
        digest_header = base64.b64encode(bytes.fromhex(digest)).decode("ascii")
        return Response(
            content=body,
            media_type="application/zip",
            headers={
                "Digest": f"sha-256=:{digest_header}:",
                "Cache-Control": "public, max-age=31536000, immutable",
                "Content-Disposition": (
                    f'attachment; filename="dowze-formation-{formation_id}-{version}.zip"'
                ),
            },
        )

    @app.get("/v1/catalog/{formation_id}/{version}/content")
    def package_content(formation_id: str, version: str):
        response = package_get(formation_id, version)
        if response.status_code != 200:
            return response
        required = {"formation.json", "matieres.json", "programme.json", "planning.json", "evaluations.json", "taches.json"}
        try:
            with zipfile.ZipFile(io.BytesIO(response.body)) as archive:
                infos = archive.infolist()
                if len(infos) > 32 or len({i.filename for i in infos}) != len(infos):
                    raise ValueError("invalid package")
                selected = [i for i in infos if i.filename in required]
                if len(selected) != 6 or any(i.file_size > 2 * 1024 * 1024 for i in selected) or sum(i.file_size for i in selected) > 8 * 1024 * 1024:
                    raise ValueError("invalid package")
                files = {i.filename: archive.read(i).decode("utf-8", errors="strict") for i in selected}
            return {"files": files}
        except (ValueError, OSError, zipfile.BadZipFile, UnicodeError):
            return error(503, "package_unavailable", "Package integrity check failed")

    @app.get("/v1/spaces")
    def spaces_get(
        after: str = Query(default="", max_length=128),
        limit: int = Query(default=100, ge=1, le=500),
        dowze_session: str | None = Cookie(default=None),
    ):
        session, failure = current_session(dowze_session)
        if failure:
            return failure
        with db.connect() as connection:
            rows = connection.execute(
                "SELECT id, formation_id, academic_year, title, created_at FROM annual_spaces "
                "WHERE account_id = ? AND id > ? ORDER BY id LIMIT ?",
                (session["id"], after, limit + 1),
            ).fetchall()
        items = [dict(row) for row in rows[:limit]]
        return {"items": items, "has_more": len(rows) > limit,
                "next_after": items[-1]["id"] if len(rows) > limit else None}

    @app.put("/v1/spaces/{space_id}")
    def space_put(
        space_id: str,
        body: AnnualSpaceInput,
        dowze_session: str | None = Cookie(default=None),
        x_csrf_token: str | None = Header(default=None),
    ):
        invalid = checked_sync_path(space_id)
        if invalid:
            return invalid
        session, failure = mutation_session(dowze_session, x_csrf_token)
        if failure:
            return failure
        status, payload = create_space(db, session["id"], space_id, body.model_dump(), app.state.now())
        return JSONResponse(payload, status_code=status)

    @app.get("/v1/spaces/{space_id}/changes")
    def changes_get(
        space_id: str,
        cursor: str | None = None,
        limit: int = Query(default=100, ge=1, le=500),
        dowze_session: str | None = Cookie(default=None),
    ):
        invalid = checked_sync_path(space_id)
        if invalid:
            return invalid
        session, failure = current_session(dowze_session)
        if failure:
            return failure
        try:
            sequence = decode_cursor(cursor, session["id"], space_id, db.cursor_secret())
        except ValueError:
            return error(400, "invalid_cursor", "Cursor is invalid")
        status, payload = list_changes(db, session["id"], space_id, sequence, limit)
        return JSONResponse(payload, status_code=status)

    @app.put("/v1/spaces/{space_id}/documents/{document_type}/{document_id}")
    def document_put(
        space_id: str,
        document_type: str,
        document_id: str,
        body: DocumentInput,
        dowze_session: str | None = Cookie(default=None),
        x_csrf_token: str | None = Header(default=None),
        x_idempotency_key: str | None = Header(default=None),
    ):
        invalid = checked_sync_path(space_id, document_type, document_id)
        if invalid:
            return invalid
        session, failure = mutation_session(dowze_session, x_csrf_token)
        if failure:
            return failure
        if not validate_idempotency_key(x_idempotency_key):
            return error(400, "invalid_idempotency_key", "A valid idempotency key is required")
        status, payload = put_document(
            db, session["id"], space_id, document_type, document_id,
            body.base_version, body.content, x_idempotency_key, app.state.now(),
            settings.sync_max_document_bytes, settings.sync_account_quota_bytes,
        )
        return JSONResponse(payload, status_code=status)

    @app.delete("/v1/spaces/{space_id}/documents/{document_type}/{document_id}")
    def document_delete(
        space_id: str,
        document_type: str,
        document_id: str,
        base_version: int = Query(ge=1),
        dowze_session: str | None = Cookie(default=None),
        x_csrf_token: str | None = Header(default=None),
        x_idempotency_key: str | None = Header(default=None),
    ):
        invalid = checked_sync_path(space_id, document_type, document_id)
        if invalid:
            return invalid
        session, failure = mutation_session(dowze_session, x_csrf_token)
        if failure:
            return failure
        if not validate_idempotency_key(x_idempotency_key):
            return error(400, "invalid_idempotency_key", "A valid idempotency key is required")
        status, payload = delete_document(
            db, session["id"], space_id, document_type, document_id,
            base_version, x_idempotency_key, app.state.now(),
        )
        return JSONResponse(payload, status_code=status)

    @app.post("/v1/spaces/{space_id}/blobs")
    async def blob_post(
        space_id: str,
        request: Request,
        dowze_session: str | None = Cookie(default=None),
        x_csrf_token: str | None = Header(default=None),
        x_idempotency_key: str | None = Header(default=None),
        x_content_sha256: str | None = Header(default=None),
    ):
        invalid = checked_sync_path(space_id)
        if invalid:
            return invalid
        session, failure = mutation_session(dowze_session, x_csrf_token)
        if failure:
            return failure
        if not validate_idempotency_key(x_idempotency_key):
            return error(400, "invalid_idempotency_key", "A valid idempotency key is required")
        status, payload = create_blob(
            db, settings.blob_dir, session["id"], space_id,
            managed_upload_content_type(request.headers.get("content-type", "")),
            x_content_sha256 or "", await request.body(), x_idempotency_key,
            app.state.now(), settings.sync_max_blob_bytes, settings.sync_account_quota_bytes,
        )
        return JSONResponse(payload, status_code=status)

    @app.get("/v1/spaces/{space_id}/blobs/{blob_id}")
    def blob_get(space_id: str, blob_id: str, dowze_session: str | None = Cookie(default=None)):
        invalid = checked_sync_path(space_id)
        if invalid:
            return invalid
        session, failure = current_session(dowze_session)
        if failure:
            return failure
        record = get_blob(db, session["id"], space_id, blob_id)
        if record is None:
            return error(404, "not_found", "Resource not found")
        try:
            root = settings.blob_dir.resolve(strict=True)
            path = (settings.blob_dir / record["stored_name"]).resolve(strict=True)
            if not 0 < record["size"] <= settings.sync_max_blob_bytes or path.parent != root or not path.is_file() or path.stat().st_size != record["size"]:
                return error(503, "blob_unavailable", "Blob integrity check failed")
            with path.open("rb") as stream:
                content = stream.read(record["size"] + 1)
        except OSError:
            return error(503, "blob_unavailable", "Blob integrity check failed")
        if len(content) != record["size"] or hashlib.sha256(content).hexdigest() != record["sha256"]:
            return error(503, "blob_unavailable", "Blob integrity check failed")
        return Response(content, media_type=record["media_type"], headers={"X-Content-SHA256": record["sha256"]})

    @app.delete("/v1/spaces/{space_id}/blobs/{blob_id}")
    def blob_delete_route(
        space_id: str,
        blob_id: str,
        dowze_session: str | None = Cookie(default=None),
        x_csrf_token: str | None = Header(default=None),
        x_idempotency_key: str | None = Header(default=None),
    ):
        invalid = checked_sync_path(space_id)
        if invalid:
            return invalid
        session, failure = mutation_session(dowze_session, x_csrf_token)
        if failure:
            return failure
        if not validate_idempotency_key(x_idempotency_key):
            return error(400, "invalid_idempotency_key", "A valid idempotency key is required")
        status, payload = delete_blob(
            db, settings.blob_dir, session["id"], space_id, blob_id,
            x_idempotency_key, app.state.now(),
        )
        if status == 204:
            return Response(status_code=204)
        return JSONResponse(payload, status_code=status)

    install_notebook_v2_routes(app, db)
    install_notebook_lifecycle_routes(app, db)
    install_notebook_routes(app, db)
    return app


app = create_app()
