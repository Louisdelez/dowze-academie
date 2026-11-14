from __future__ import annotations

import base64
from datetime import datetime, timezone
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import sqlite3
from typing import Any
from uuid import uuid4

from .db import Database
from .notebook_media_types import managed_blob_media_type

MAX_IDEMPOTENCY_RECORDS = 100_000
MAX_CHANGE_PAGE_BYTES = 8 * 1024 * 1024


class IdempotencyCapacityError(RuntimeError):
    pass


DOCUMENT_TYPES = {
    "notesMarkdown",
    "whiteboard",
    "planning",
    "progression",
    "examens",
    "conversations",
    "tasks",
    "formation",
    "preferences",
}
SYNC_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
IDEMPOTENCY_PATTERN = re.compile(r"^[\x21-\x7e]{1,128}$")
SHA256_PATTERN = re.compile(r"^[a-f0-9]{64}$")
BLOB_MEDIA_TYPES = {"image/jpeg", "image/png", "image/webp", "application/pdf", "application/octet-stream"}
BLOB_FILE_PATTERN = re.compile(r"^[a-f0-9]{64}\.blob(?:\.tmp|\.deleting)?$")


def utc_text(now: datetime) -> str:
    return now.astimezone(timezone.utc).isoformat()


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True, allow_nan=False)


def request_digest(*parts: str | bytes) -> str:
    digest = hashlib.sha256()
    for part in parts:
        encoded = part if isinstance(part, bytes) else part.encode("utf-8")
        digest.update(len(encoded).to_bytes(8, "big"))
        digest.update(encoded)
    return digest.hexdigest()


def validate_sync_id(value: str) -> bool:
    return bool(SYNC_ID_PATTERN.fullmatch(value))


def validate_idempotency_key(value: str | None) -> bool:
    return bool(value and IDEMPOTENCY_PATTERN.fullmatch(value))


def _stored_result(connection: sqlite3.Connection, account_id: str, key: str, digest: str):
    row = connection.execute(
        "SELECT request_hash, status_code, response_json FROM sync_idempotency "
        "WHERE account_id = ? AND idempotency_key = ?",
        (account_id, key),
    ).fetchone()
    if row is None:
        return None
    if row["request_hash"] != digest:
        return 422, {"code": "idempotency_key_reused", "message": "Idempotency key was used for another request"}
    return row["status_code"], json.loads(row["response_json"])


def _save_result(
    connection: sqlite3.Connection,
    account_id: str,
    key: str,
    digest: str,
    status: int,
    payload: dict,
    now: datetime,
) -> tuple[int, dict]:
    count = connection.execute("SELECT count(*) FROM sync_idempotency WHERE account_id = ?", (account_id,)).fetchone()[0]
    if count >= MAX_IDEMPOTENCY_RECORDS:
        raise IdempotencyCapacityError("idempotency_capacity")
    connection.execute(
        "INSERT INTO sync_idempotency "
        "(account_id, idempotency_key, request_hash, status_code, response_json, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (account_id, key, digest, status, canonical_json(payload), utc_text(now)),
    )
    return status, payload


def create_space(db: Database, account_id: str, space_id: str, data: dict, now: datetime) -> tuple[int, dict]:
    with db.transaction() as connection:
        existing = connection.execute(
            "SELECT formation_id, academic_year, title, created_at FROM annual_spaces WHERE account_id = ? AND id = ?",
            (account_id, space_id),
        ).fetchone()
        if existing:
            expected = (data["formation_id"], data["academic_year"], data["title"])
            actual = (existing["formation_id"], existing["academic_year"], existing["title"])
            if actual != expected:
                return 409, {"code": "space_exists", "message": "Annual space already exists"}
            return 200, {"id": space_id, **data, "created_at": existing["created_at"]}
        created_at = utc_text(now)
        connection.execute(
            "INSERT INTO annual_spaces (account_id, id, formation_id, academic_year, title, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (account_id, space_id, data["formation_id"], data["academic_year"], data["title"], created_at),
        )
        return 201, {"id": space_id, **data, "created_at": created_at}


def space_exists(connection: sqlite3.Connection, account_id: str, space_id: str) -> bool:
    return connection.execute(
        "SELECT 1 FROM annual_spaces WHERE account_id = ? AND id = ?", (account_id, space_id)
    ).fetchone() is not None


def _account_usage(connection: sqlite3.Connection, account_id: str) -> int:
    history = connection.execute(
        "SELECT COALESCE(sum(length(CAST(content_json AS BLOB))), 0) FROM sync_changes "
        "WHERE account_id = ? AND content_json IS NOT NULL",
        (account_id,),
    ).fetchone()[0]
    blobs = connection.execute(
        "SELECT COALESCE(sum(size), 0) FROM sync_blobs WHERE account_id = ?", (account_id,)
    ).fetchone()[0]
    return int(history) + int(blobs)


def _blob_ids(content: Any) -> list[str]:
    if not isinstance(content, dict) or "blob_ids" not in content:
        return []
    values = content["blob_ids"]
    if not isinstance(values, list) or len(values) > 1000 or any(not isinstance(value, str) for value in values):
        raise ValueError("blob_ids must be a bounded string array")
    if len(values) != len(set(values)):
        raise ValueError("blob_ids must be unique")
    return values


def put_document(
    db: Database,
    account_id: str,
    space_id: str,
    document_type: str,
    document_id: str,
    base_version: int,
    content: Any,
    key: str,
    now: datetime,
    max_document_bytes: int,
    account_quota_bytes: int,
) -> tuple[int, dict]:
    try:
        encoded = canonical_json(content).encode("utf-8")
        blob_ids = _blob_ids(content)
    except (TypeError, ValueError):
        return 400, {"code": "invalid_document", "message": "Document content is invalid"}
    digest = request_digest("put", space_id, document_type, document_id, str(base_version), encoded)
    with db.transaction() as connection:
        from .notebook_acl import private_write_is_managed
        if private_write_is_managed(connection, account_id, space_id, document_type, document_id):
            return 409, {"code": "managed_notebook_protocol_required", "message": "Use the explicitly admitted managed notebook adapter"}
        replay = _stored_result(connection, account_id, key, digest)
        if replay:
            return replay
        if not space_exists(connection, account_id, space_id):
            return _save_result(connection, account_id, key, digest, 404, {"code": "space_not_found", "message": "Annual space not found"}, now)
        if len(encoded) > max_document_bytes:
            return _save_result(connection, account_id, key, digest, 413, {"code": "document_too_large", "message": "Document exceeds UTF-8 size limit"}, now)
        current = connection.execute(
            "SELECT version, content_bytes FROM sync_documents WHERE account_id = ? AND space_id = ? AND document_type = ? AND document_id = ?",
            (account_id, space_id, document_type, document_id),
        ).fetchone()
        current_version = current["version"] if current else 0
        if current_version != base_version:
            return _save_result(connection, account_id, key, digest, 409, {"code": "version_conflict", "message": "Base version does not match", "current_version": current_version}, now)
        if _account_usage(connection, account_id) + len(encoded) > account_quota_bytes:
            return _save_result(connection, account_id, key, digest, 413, {"code": "account_quota_exceeded", "message": "Account storage quota exceeded"}, now)
        for blob_id in blob_ids:
            blob = connection.execute(
                "SELECT 1 FROM sync_blobs WHERE id = ? AND account_id = ? AND space_id = ?",
                (blob_id, account_id, space_id),
            ).fetchone()
            if blob is None:
                return _save_result(connection, account_id, key, digest, 422, {"code": "invalid_blob_reference", "message": "Blob is unavailable in this annual space"}, now)
        version = current_version + 1
        changed_at = utc_text(now)
        connection.execute(
            "INSERT INTO sync_documents (account_id, space_id, document_type, document_id, version, content_json, content_bytes, deleted, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?) "
            "ON CONFLICT(account_id, space_id, document_type, document_id) DO UPDATE SET "
            "version=excluded.version, content_json=excluded.content_json, content_bytes=excluded.content_bytes, deleted=0, updated_at=excluded.updated_at",
            (account_id, space_id, document_type, document_id, version, encoded.decode("utf-8"), len(encoded), changed_at),
        )
        connection.execute(
            "DELETE FROM sync_blob_refs WHERE account_id = ? AND space_id = ? AND document_type = ? AND document_id = ?",
            (account_id, space_id, document_type, document_id),
        )
        for blob_id in blob_ids:
            connection.execute(
                "INSERT INTO sync_blob_refs (blob_id, account_id, space_id, document_type, document_id) VALUES (?, ?, ?, ?, ?)",
                (blob_id, account_id, space_id, document_type, document_id),
            )
        connection.execute(
            "INSERT INTO sync_changes (account_id, space_id, document_type, document_id, version, content_json, deleted, changed_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)",
            (account_id, space_id, document_type, document_id, version, encoded.decode("utf-8"), changed_at),
        )
        payload = {"space_id": space_id, "document_type": document_type, "document_id": document_id, "version": version, "deleted": False, "content": content, "changed_at": changed_at}
        return _save_result(connection, account_id, key, digest, 200, payload, now)


def delete_document(
    db: Database,
    account_id: str,
    space_id: str,
    document_type: str,
    document_id: str,
    base_version: int,
    key: str,
    now: datetime,
) -> tuple[int, dict]:
    digest = request_digest("delete", space_id, document_type, document_id, str(base_version))
    with db.transaction() as connection:
        from .notebook_acl import private_write_is_managed
        if private_write_is_managed(connection, account_id, space_id, document_type, document_id):
            return 409, {"code": "managed_notebook_protocol_required", "message": "Use the explicitly admitted managed notebook adapter"}
        replay = _stored_result(connection, account_id, key, digest)
        if replay:
            return replay
        if not space_exists(connection, account_id, space_id):
            return _save_result(connection, account_id, key, digest, 404, {"code": "space_not_found", "message": "Annual space not found"}, now)
        current = connection.execute(
            "SELECT version, deleted FROM sync_documents WHERE account_id = ? AND space_id = ? AND document_type = ? AND document_id = ?",
            (account_id, space_id, document_type, document_id),
        ).fetchone()
        current_version = current["version"] if current else 0
        if current_version != base_version:
            return _save_result(connection, account_id, key, digest, 409, {"code": "version_conflict", "message": "Base version does not match", "current_version": current_version}, now)
        if current is None:
            return _save_result(connection, account_id, key, digest, 404, {"code": "document_not_found", "message": "Document not found"}, now)
        version = current_version + 1
        changed_at = utc_text(now)
        connection.execute(
            "UPDATE sync_documents SET version = ?, content_json = NULL, content_bytes = 0, deleted = 1, updated_at = ? "
            "WHERE account_id = ? AND space_id = ? AND document_type = ? AND document_id = ?",
            (version, changed_at, account_id, space_id, document_type, document_id),
        )
        connection.execute(
            "DELETE FROM sync_blob_refs WHERE account_id = ? AND space_id = ? AND document_type = ? AND document_id = ?",
            (account_id, space_id, document_type, document_id),
        )
        connection.execute(
            "INSERT INTO sync_changes (account_id, space_id, document_type, document_id, version, content_json, deleted, changed_at) VALUES (?, ?, ?, ?, ?, NULL, 1, ?)",
            (account_id, space_id, document_type, document_id, version, changed_at),
        )
        payload = {"space_id": space_id, "document_type": document_type, "document_id": document_id, "version": version, "deleted": True, "content": None, "changed_at": changed_at}
        return _save_result(connection, account_id, key, digest, 200, payload, now)


def _cursor_signature(secret: bytes, account_id: str, space_id: str, sequence: int) -> str:
    message = f"v1\0{account_id}\0{space_id}\0{sequence}".encode("utf-8")
    return hmac.new(secret, message, hashlib.sha256).hexdigest()


def encode_cursor(sequence: int, account_id: str, space_id: str, secret: bytes) -> str:
    value = f"v1:{sequence}:{_cursor_signature(secret, account_id, space_id, sequence)}"
    return base64.urlsafe_b64encode(value.encode("ascii")).decode("ascii").rstrip("=")


def decode_cursor(cursor: str | None, account_id: str, space_id: str, secret: bytes) -> int:
    if cursor is None:
        return 0
    try:
        if len(cursor) > 256:
            raise ValueError
        padded = cursor + "=" * (-len(cursor) % 4)
        raw = base64.urlsafe_b64decode(padded)
        if base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=") != cursor:
            raise ValueError
        decoded = raw.decode("ascii")
        prefix, sequence, signature = decoded.split(":", 2)
        if prefix != "v1" or not sequence.isdigit() or int(sequence) > 9_223_372_036_854_775_807:
            raise ValueError
        number = int(sequence)
        expected = _cursor_signature(secret, account_id, space_id, number)
        if not hmac.compare_digest(signature, expected):
            raise ValueError
        return number
    except (ValueError, UnicodeError, base64.binascii.Error) as error:
        raise ValueError("invalid cursor") from error


def list_changes(db: Database, account_id: str, space_id: str, cursor: int, limit: int) -> tuple[int, dict]:
    with db.connect() as connection:
        if not space_exists(connection, account_id, space_id):
            return 404, {"code": "space_not_found", "message": "Annual space not found"}
        if cursor and connection.execute(
            "SELECT 1 FROM sync_changes WHERE account_id = ? AND space_id = ? AND sequence = ?",
            (account_id, space_id, cursor),
        ).fetchone() is None:
            return 400, {"code": "invalid_cursor", "message": "Cursor is invalid"}
        rows = connection.execute(
            "SELECT sequence, document_type, document_id, version, content_json, deleted, changed_at "
            "FROM sync_changes WHERE account_id = ? AND space_id = ? AND sequence > ? ORDER BY sequence LIMIT ?",
            (account_id, space_id, cursor, limit + 1),
        )
        page = []
        total = 0
        has_more = False
        for row in rows:
            # Reserve room for identifiers, JSON framing, cursor and timestamps.
            size = len((row["content_json"] or "").encode("utf-8")) + 2048
            if len(page) >= limit or (page and total + size > MAX_CHANGE_PAGE_BYTES):
                has_more = True
                break
            page.append(row)
            total += size
    items = [
        {"sequence": row["sequence"], "space_id": space_id, "document_type": row["document_type"], "document_id": row["document_id"], "version": row["version"], "deleted": bool(row["deleted"]), "content": None if row["content_json"] is None else json.loads(row["content_json"]), "changed_at": row["changed_at"]}
        for row in page
    ]
    next_sequence = page[-1]["sequence"] if page else cursor
    return 200, {
        "items": items,
        "next_cursor": encode_cursor(next_sequence, account_id, space_id, db.cursor_secret()),
        "has_more": has_more,
    }


def create_blob(
    db: Database,
    blob_dir: Path,
    account_id: str,
    space_id: str,
    media_type: str,
    expected_sha256: str,
    body: bytes,
    key: str,
    now: datetime,
    max_blob_bytes: int,
    account_quota_bytes: int,
) -> tuple[int, dict]:
    digest = request_digest("blob", space_id, media_type, expected_sha256, body)
    blob_dir.mkdir(parents=True, exist_ok=True)
    stored_name: str | None = None
    final_path: Path | None = None
    try:
        with db.transaction() as connection:
            replay = _stored_result(connection, account_id, key, digest)
            if replay:
                return replay
            if not space_exists(connection, account_id, space_id):
                return _save_result(connection, account_id, key, digest, 404, {"code": "space_not_found", "message": "Annual space not found"}, now)
            if not managed_blob_media_type(media_type):
                return _save_result(connection, account_id, key, digest, 415, {"code": "unsupported_media_type", "message": "Blob media type is not supported"}, now)
            if not body or len(body) > max_blob_bytes:
                return _save_result(connection, account_id, key, digest, 413, {"code": "blob_too_large", "message": "Blob exceeds size limit"}, now)
            actual_hash = hashlib.sha256(body).hexdigest()
            if not SHA256_PATTERN.fullmatch(expected_sha256) or actual_hash != expected_sha256:
                return _save_result(connection, account_id, key, digest, 422, {"code": "hash_mismatch", "message": "Blob SHA-256 does not match"}, now)
            if _account_usage(connection, account_id) + len(body) > account_quota_bytes:
                return _save_result(connection, account_id, key, digest, 413, {"code": "account_quota_exceeded", "message": "Account storage quota exceeded"}, now)
            blob_id = str(uuid4())
            stored_name = secrets.token_hex(32) + ".blob"
            final_path = blob_dir / stored_name
            temporary = blob_dir / (stored_name + ".tmp")
            with temporary.open("xb") as stream:
                stream.write(body)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, final_path)
            connection.execute(
                "INSERT INTO sync_blobs (id, account_id, space_id, stored_name, media_type, size, sha256, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (blob_id, account_id, space_id, stored_name, media_type, len(body), actual_hash, utc_text(now)),
            )
            payload = {"id": blob_id, "space_id": space_id, "media_type": media_type, "size": len(body), "sha256": actual_hash, "created_at": utc_text(now)}
            return _save_result(connection, account_id, key, digest, 201, payload, now)
    except BaseException:
        if final_path is not None:
            final_path.unlink(missing_ok=True)
        raise


def get_blob(db: Database, account_id: str, space_id: str, blob_id: str) -> dict | None:
    with db.connect() as connection:
        row = connection.execute(
            "SELECT stored_name, media_type, size, sha256 FROM sync_blobs "
            "WHERE id = ? AND account_id = ? AND space_id = ?",
            (blob_id, account_id, space_id),
        ).fetchone()
    return dict(row) if row else None


def delete_blob(
    db: Database,
    blob_dir: Path,
    account_id: str,
    space_id: str,
    blob_id: str,
    key: str,
    now: datetime,
) -> tuple[int, dict | None]:
    digest = request_digest("delete-blob", space_id, blob_id)
    final_path: Path | None = None
    deleting_path: Path | None = None
    try:
        with db.transaction() as connection:
            # Managed originals and historical media pins survive removal from
            # the live graph. Check before even an old private receipt replay.
            if connection.execute("SELECT 1 FROM notebook_uploads u JOIN notebook_resources r ON r.id=u.resource_id WHERE u.blob_id=? AND r.owner_account_id=? AND r.space_id=?", (blob_id, account_id, space_id)).fetchone() or connection.execute("SELECT 1 FROM notebook_version_blobs p JOIN notebook_resources r ON r.id=p.resource_id WHERE p.blob_id=? AND r.owner_account_id=? AND r.space_id=?", (blob_id, account_id, space_id)).fetchone():
                return 409, {"code": "managed_blob_retained", "message": "Managed originals require an explicit retention operation"}
            replay = _stored_result(connection, account_id, key, digest)
            if replay:
                return replay[0], replay[1]
            row = connection.execute(
                "SELECT stored_name FROM sync_blobs WHERE id = ? AND account_id = ? AND space_id = ?",
                (blob_id, account_id, space_id),
            ).fetchone()
            if row is None:
                return _save_result(connection, account_id, key, digest, 404, {"code": "blob_not_found", "message": "Blob not found"}, now)
            if connection.execute("SELECT 1 FROM sync_blob_refs WHERE blob_id = ? LIMIT 1", (blob_id,)).fetchone():
                return _save_result(connection, account_id, key, digest, 409, {"code": "blob_in_use", "message": "Blob is referenced by a document"}, now)
            final_path = blob_dir / row["stored_name"]
            deleting_path = blob_dir / (row["stored_name"] + ".deleting")
            try:
                os.replace(final_path, deleting_path)
            except OSError:
                return 503, {"code": "blob_unavailable", "message": "Blob deletion could not be completed"}
            connection.execute(
                "DELETE FROM sync_blobs WHERE id = ? AND account_id = ? AND space_id = ?",
                (blob_id, account_id, space_id),
            )
            _save_result(connection, account_id, key, digest, 204, {}, now)
    except BaseException:
        if deleting_path is not None and final_path is not None and deleting_path.exists():
            os.replace(deleting_path, final_path)
        raise
    deleting_path.unlink(missing_ok=True)
    return 204, None


def reconcile_blob_directory(db: Database, blob_dir: Path) -> None:
    blob_dir.mkdir(parents=True, exist_ok=True)
    with db.transaction() as connection:
        known = {row["stored_name"] for row in connection.execute("SELECT stored_name FROM sync_blobs")}
        for path in blob_dir.iterdir():
            if not path.is_file() or not BLOB_FILE_PATTERN.fullmatch(path.name):
                continue
            if path.name.endswith(".tmp"):
                path.unlink(missing_ok=True)
                continue
            if path.name.endswith(".deleting"):
                original_name = path.name.removesuffix(".deleting")
                original = blob_dir / original_name
                if original_name in known and not original.exists():
                    os.replace(path, original)
                else:
                    path.unlink(missing_ok=True)
                continue
            if path.name not in known:
                path.unlink(missing_ok=True)
