"""Read-only discovery of resources the live actor already owns or can read.

A page is not an access grant or a local notebook. Normal state/blob readers and
all mutations still require their existing live resource/incarnation/ACL checks.
No table, receipt, private sync cursor, file or account preference is written.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import re
from typing import Literal

from fastapi import Cookie, Header, Query, Request
from fastapi.responses import JSONResponse

from .notebook_acl import RequestAuthority, _descriptor, fail, timestamp
from .notebook_metadata import project_metadata
from .notebook_payload import _json_text, _json_object, _invalid_constant, NotebookPayloadError
from .notebook_wire import MAX_SOURCE_BYTES
from .security import token_hash
from .sync import canonical_json, validate_sync_id

PROTOCOL = "dowze-managed-notebook-collection@1"
MAX_ITEMS = 20
MAX_AUTHORIZED_ROWS = 2_000
MAX_REPLY_BYTES = 131_072
MAX_TITLE_UNITS = 200
CURSOR_SECONDS = 300
UUID = re.compile(r"^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$")
HASH = re.compile(r"^[a-f0-9]{64}$")
CURSOR = re.compile(r"^([A-Za-z0-9_-]{1,768})\.([a-f0-9]{64})$")


def _invalid_cursor():
    fail(400, "invalid_notebook_collection_cursor", "The collection cursor is not valid for this session and scope")


def _binding(actor, token, view, space_id, owner_account_id):
    # Token hash is only a server-side HMAC input, never part of the payload.
    return canonical_json([PROTOCOL, actor, token_hash(token), view, space_id, owner_account_id]).encode("utf-8")


def _secret(connection):
    row = connection.execute("SELECT value FROM app_metadata WHERE key='cursor_secret'").fetchone()
    if row is None or not isinstance(row["value"], str) or not HASH.fullmatch(row["value"]):
        fail(503, "notebook_collection_unavailable", "The collection cursor service is unavailable")
    return bytes.fromhex(row["value"])


def _decode(cursor, secret, binding, now):
    match = CURSOR.fullmatch(cursor)
    if match is None:
        _invalid_cursor()
    encoded, signature = match.groups()
    expected = hmac.new(secret, binding + b"\0" + encoded.encode("ascii"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected):
        _invalid_cursor()
    try:
        raw = base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4))
        value = json.loads(raw.decode("ascii"))
        if (not isinstance(value, dict) or set(value) != {"v", "after", "epoch", "expires"}
                or type(value["v"]) is not int or value["v"] != 1
                or not isinstance(value["after"], str) or not UUID.fullmatch(value["after"])
                or not isinstance(value["epoch"], str) or not HASH.fullmatch(value["epoch"])
                or type(value["expires"]) is not int
                or not int(now.timestamp()) < value["expires"] <= int(now.timestamp()) + CURSOR_SECONDS
                or canonical_json(value).encode("ascii") != raw
                or base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=") != encoded):
            _invalid_cursor()
    except (ValueError, UnicodeError, TypeError):
        _invalid_cursor()
    return value


def _encode(after, epoch, expires, secret, binding):
    raw = canonical_json({"v": 1, "after": after, "epoch": epoch, "expires": expires}).encode("ascii")
    encoded = base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")
    signature = hmac.new(secret, binding + b"\0" + encoded.encode("ascii"), hashlib.sha256).hexdigest()
    return encoded + "." + signature


def _rows(connection, actor, space_id, owner_account_id, view, now):
    conditions = ["r.state='active'", "r.space_id=?"]
    parameters = [actor, timestamp(now), space_id]
    if owner_account_id is not None:
        conditions.append("r.owner_account_id=?")
        parameters.append(owner_account_id)
    if view in ("owned", "outgoing"):
        conditions.append("r.owner_account_id=?")
        parameters.append(actor)
        if view == "outgoing":
            conditions.append("(EXISTS(SELECT 1 FROM notebook_grants og WHERE og.resource_id=r.id AND og.revoked_at IS NULL) "
                              "OR EXISTS(SELECT 1 FROM notebook_invitations oi WHERE oi.resource_id=r.id AND oi.state='pending' AND oi.expires_at>?))")
            parameters.append(timestamp(now))
    else:
        conditions.extend(["r.owner_account_id<>?", "g.account_id IS NOT NULL", "g.revoked_at IS NULL"])
        parameters.append(actor)
    # All rows entering the epoch are ALREADY authorized. No global count or
    # unrelated recipient/account/catalog information enters a response/digest.
    query = ("SELECT r.*,g.role AS grant_role,g.version AS grant_version,"
             "c.version AS canonical_version,c.deleted AS canonical_deleted,"
             "m.version AS metadata_version,m.deleted AS metadata_deleted,"
             "EXISTS(SELECT 1 FROM notebook_grants og WHERE og.resource_id=r.id AND og.revoked_at IS NULL) AS outgoing_grant,"
             "EXISTS(SELECT 1 FROM notebook_invitations oi WHERE oi.resource_id=r.id AND oi.state='pending' AND oi.expires_at>?) AS outgoing_invitation "
             "FROM notebook_resources r LEFT JOIN notebook_grants g ON g.resource_id=r.id AND g.account_id=? "
             "LEFT JOIN sync_documents c ON c.account_id=r.owner_account_id AND c.space_id=r.space_id AND c.document_type='whiteboard' AND c.document_id=r.canonical_document_id "
             "LEFT JOIN sync_documents m ON m.account_id=r.owner_account_id AND m.space_id=r.space_id AND m.document_type='notesMarkdown' AND m.document_id=r.metadata_document_id "
             "WHERE " + " AND ".join(conditions) + " ORDER BY r.id LIMIT ?")
    # The first placeholders are the SELECT invitation clock, then JOIN actor.
    values = [parameters[1], parameters[0], *parameters[2:], MAX_AUTHORIZED_ROWS + 1]
    rows = connection.execute(query, tuple(values)).fetchall()
    if len(rows) > MAX_AUTHORIZED_ROWS:
        fail(429, "notebook_collection_capacity", "The authorized collection needs a narrower owner or year scope")
    return rows


def _epoch(rows):
    fields = ("id", "incarnation", "owner_account_id", "space_id", "note_id", "canonical_document_id", "metadata_document_id", "lineage", "state",
              "resource_version", "acl_version", "grant_role", "grant_version", "canonical_version", "canonical_deleted", "metadata_version", "metadata_deleted",
              "outgoing_grant", "outgoing_invitation")
    return hashlib.sha256(canonical_json([[row[name] for name in fields] for row in rows]).encode("utf-8")).hexdigest()


def _title(connection, resource):
    # Called only for an ACL-filtered page row, using its registered OWNER/space
    # and exact metadata identity. It never enumerates recipient private storage.
    row = connection.execute("SELECT content_json,content_bytes,deleted,updated_at FROM sync_documents WHERE account_id=? AND space_id=? AND document_type='notesMarkdown' AND document_id=?",
                             (resource["owner_account_id"], resource["space_id"], resource["metadata_document_id"])).fetchone()
    fallback = {"title": "Note sans titre", "title_status": "unavailable", "title_truncated": False,
                "updated_at": resource["updated_at"]}
    if row is None or row["deleted"] or row["content_json"] is None or not 0 <= row["content_bytes"] <= MAX_SOURCE_BYTES:
        return fallback
    try:
        raw = row["content_json"].encode("utf-8", errors="strict")
        if len(raw) > MAX_SOURCE_BYTES:
            return fallback
        projected = project_metadata(resource, json.loads(_json_text(raw), object_pairs_hook=_json_object, parse_constant=_invalid_constant))
        title = projected.get("title") if projected is not None else None
        if not isinstance(title, str) or any(ord(char) < 32 or 0x7f <= ord(char) <= 0x9f for char in title):
            return fallback
        title = title.strip()
        units = title.encode("utf-16-be", errors="strict")
        if not title:
            return {**fallback, "title_status": "untitled", "updated_at": row["updated_at"]}
        truncated = len(units) // 2 > MAX_TITLE_UNITS
        if truncated:
            # Never cut a UTF-16 surrogate pair; response clearly reports a
            # shortened display label without changing the actual stored title.
            title = units[:(MAX_TITLE_UNITS - 1) * 2].decode("utf-16-be", errors="ignore") + "…"
        return {"title": title, "title_status": "current", "title_truncated": truncated, "updated_at": row["updated_at"]}
    except (ValueError, UnicodeError, TypeError, RecursionError, NotebookPayloadError):
        return fallback


def collection_page(db, token, expected_account, clock, *, view, space_id, owner_account_id=None, cursor="", limit=20):
    if (view not in ("owned", "outgoing", "incoming") or not isinstance(space_id, str) or not validate_sync_id(space_id)
            or owner_account_id is not None and (not isinstance(owner_account_id, str) or not UUID.fullmatch(owner_account_id))
            or not isinstance(cursor, str) or len(cursor) > 834 or type(limit) is not int or not 1 <= limit <= MAX_ITEMS):
        fail(400, "invalid_notebook_collection_scope", "An exact collection view, year scope and bounded page are required")
    authority = RequestAuthority(token, expected_account, None, clock, mutation=False)
    with db.transaction() as connection:
        actor, now = authority.check(connection)
        if view in ("owned", "outgoing") and owner_account_id not in (None, actor):
            fail(400, "invalid_notebook_collection_scope", "An owned collection cannot select another owner")
        secret = _secret(connection)
        binding = _binding(actor, token, view, space_id, owner_account_id)
        previous = _decode(cursor, secret, binding, now) if cursor else None
        rows = _rows(connection, actor, space_id, owner_account_id, view, now)
        epoch = _epoch(rows)
        if previous is not None and previous["epoch"] != epoch:
            fail(409, "notebook_collection_changed", "The authorized collection changed; restart from its first page")
        after = previous["after"] if previous is not None else ""
        following = [row for row in rows if row["id"] > after]
        page = following[:limit]
        items = []
        for row in page:
            grant = {"role": row["grant_role"], "version": row["grant_version"]} if row["owner_account_id"] != actor else None
            items.append({"resource": _descriptor(row, actor, grant), **_title(connection, row),
                          "direction": "incoming" if row["owner_account_id"] != actor else "outgoing" if row["outgoing_grant"] or row["outgoing_invitation"] else "owned"})
        _, finished = authority.check(connection)
        # An invitation expiry during this page can change outgoing membership.
        # Never publish a mixed-clock page or silently advance its cursor.
        if _epoch(_rows(connection, actor, space_id, owner_account_id, view, finished)) != epoch:
            fail(409, "notebook_collection_changed", "The authorized collection changed; restart from its first page")
        expires = previous["expires"] if previous is not None else int(now.timestamp()) + CURSOR_SECONDS
        if int(finished.timestamp()) >= expires:
            _invalid_cursor()
        more = len(following) > limit
        result = {"protocol": PROTOCOL, "actor_account_id": actor, "scope": {"view": view, "space_id": space_id, "owner_account_id": owner_account_id},
                  "epoch": epoch, "items": items, "has_more": more,
                  "next_cursor": _encode(page[-1]["id"], epoch, expires, secret, binding) if more else None}
        if len(canonical_json(result).encode("utf-8")) > MAX_REPLY_BYTES:
            fail(503, "notebook_collection_unavailable", "The collection reply exceeds its bounded budget")
        return result


def install_notebook_collection_routes(app, db):
    # Called from the real v2 installer, before the existing dynamic UUID route.
    from .notebook_write_routes import describe_writer

    @app.get("/v1/notebooks/collection")
    def collection_get(request: Request, view: Literal["owned", "outgoing", "incoming"], space_id: str = Query(max_length=128),
                       owner_account_id: str | None = Query(default=None, max_length=36), cursor: str = Query(default="", max_length=834),
                       limit: int = Query(default=20, ge=1, le=MAX_ITEMS),
                       dowze_session: str | None = Cookie(default=None), x_dowze_account: str | None = Header(default=None)):
        entries = request.query_params.multi_items()
        names = [name for name, _ in entries]
        if len(names) != len(set(names)) or not {"view", "space_id"}.issubset(names) or not set(names).issubset({"view", "space_id", "owner_account_id", "cursor", "limit"}):
            fail(400, "invalid_notebook_collection_scope", "Unknown or repeated collection query members are not accepted")
        value = collection_page(db, dowze_session, x_dowze_account, app.state.now, view=view, space_id=space_id,
                                owner_account_id=owner_account_id, cursor=cursor, limit=limit)
        # Same existing runtime capability projection; every subsequent read and
        # mutation still rechecks the live actor/ACL/incarnation, never this page.
        value["items"] = [{**item, "resource": describe_writer(app, item["resource"])} for item in value["items"]]
        return JSONResponse(value, headers={"Cache-Control": "no-store, private", "Pragma": "no-cache"})
