"""Read immutable bytes attached to one authorized managed notebook, never a space."""
from __future__ import annotations
from .notebook_metadata import project_metadata


from dataclasses import dataclass
import hashlib
import json
import os
import stat

from fastapi import Cookie, Header, Query
from fastapi.responses import Response

from .notebook_acl import RequestAuthority, MAX_VERSION, fail
from .notebook_payload import decode_notebook_source, NotebookPayloadError, NotebookPayloadPolicy, SHA256, STORED_NAME, SYNC_ID, _json_text

MAX_SHARED_BLOB_BYTES = 32 * 1024 * 1024
MAX_MEDIA_REFERENCES = 1_000
MAX_MEDIA_NODES = 100_000
CHUNK_BYTES = 64 * 1024


def _integer(value, low, high):
    return isinstance(value, int) and not isinstance(value, bool) and low <= value <= high


def _bad_manifest():
    fail(409, "notebook_media_unproved", "Notebook attachment references need an explicit verified adapter")


def _blob(connection, resource, blob_id, maximum):
    row = connection.execute("SELECT id,stored_name,media_type,size,sha256 FROM sync_blobs WHERE id=? AND account_id=? AND space_id=?",
                             (blob_id, resource["owner_account_id"], resource["space_id"])).fetchone()
    if row is None or not _integer(row["size"], 1, min(maximum, MAX_SHARED_BLOB_BYTES)) or not isinstance(row["sha256"], str) or not SHA256.fullmatch(row["sha256"]):
        _bad_manifest()
    return row


def _manifest(connection, resource, documents, decoded, maximum, *, verify_stored_refs=True):
    """Derive access from actual canonical assets, never trust blob_ids alone."""
    document, body_id = decoded.document, decoded.body_id
    assets = document["assets"]
    if len(assets) > MAX_MEDIA_REFERENCES:
        _bad_manifest()
    logical, blobs, references = {}, {}, []
    for asset in assets:
        if not isinstance(asset, dict) or not isinstance(asset.get("id"), str) or not 0 < len(asset["id"]) <= 200 or asset["id"] in logical or not isinstance(asset.get("serverId"), str) or not SYNC_ID.fullmatch(asset["serverId"]):
            _bad_manifest()
        row = _blob(connection, resource, asset["serverId"], maximum)
        if asset.get("size") != row["size"] or not _integer(asset.get("size"), 1, MAX_SHARED_BLOB_BYTES) or asset.get("mediaType") != row["media_type"]:
            _bad_manifest()
        logical[asset["id"]] = (asset, row)
        if row["id"] not in blobs:
            references.append(row["id"])
            blobs[row["id"]] = row
    source_references = document.get("blob_ids")
    if "blob_ids" not in document:
        if references:
            _bad_manifest()
    elif source_references != references:
        _bad_manifest()
    transport_references = [*references, body_id] if body_id else references
    if len(transport_references) > MAX_MEDIA_REFERENCES:
        _bad_manifest()
    if body_id:
        if body_id in blobs or documents[0]["content"].get("blob_ids") != transport_references:
            _bad_manifest()
        blobs[body_id] = _blob(connection, resource, body_id, maximum)
    metadata = project_metadata(resource, documents[1]["content"])
    if metadata is None:
        _bad_manifest()
    metadata_references = metadata.get("blob_ids", [])
    if not isinstance(metadata_references, list) or len(metadata_references) > MAX_MEDIA_REFERENCES or any(not isinstance(value, str) for value in metadata_references) or len(set(metadata_references)) != len(metadata_references) or not set(metadata_references).issubset(blobs):
        _bad_manifest()
    if verify_stored_refs:
        for kind, document_id, expected in (("whiteboard", resource["canonical_document_id"], transport_references), ("notesMarkdown", resource["metadata_document_id"], metadata_references)):
            rows = connection.execute("SELECT blob_id FROM sync_blob_refs WHERE account_id=? AND space_id=? AND document_type=? AND document_id=?", (resource["owner_account_id"], resource["space_id"], kind, document_id)).fetchall()
            if {row["blob_id"] for row in rows} != set(expected):
                _bad_manifest()
    nodes = len(assets)
    def charge(count):
        nonlocal nodes
        nodes += count
        if nodes > MAX_MEDIA_NODES:
            _bad_manifest()
    def attachment(value):
        if not isinstance(value, str) or value not in logical:
            _bad_manifest()
        return logical[value]
    def audio_source(source, root):
        if not isinstance(source, dict) or source.get("schema") != 1 or not isinstance(source.get("chunks"), list) or not 1 <= len(source["chunks"]) <= 10_000:
            _bad_manifest()
        charge(len(source["chunks"]))
        total, seen = 0, set()
        for index, chunk in enumerate(source["chunks"]):
            if not isinstance(chunk, dict):
                _bad_manifest()
            asset, row = attachment(chunk.get("assetId"))
            if asset["id"] in seen or index == 0 and asset["id"] != root or not _integer(chunk.get("size"), 1, MAX_SHARED_BLOB_BYTES) or chunk["size"] != row["size"] or chunk.get("sha256") != row["sha256"]:
                _bad_manifest()
            seen.add(asset["id"])
            total += row["size"]
        if not _integer(source.get("size"), 1, 256 * 1024 * 1024) or source["size"] != total:
            _bad_manifest()
    charge(len(document["pages"]) + len(document["objects"]) + len(document["audio"]))
    for page in document["pages"]:
        if not isinstance(page, dict):
            _bad_manifest()
        if page.get("pdf") is not None:
            if not isinstance(page["pdf"], dict):
                _bad_manifest()
            attachment(page["pdf"].get("assetId"))
    for item in document["objects"]:
        if not isinstance(item, dict):
            _bad_manifest()
        if item.get("kind") == "image":
            attachment(item.get("assetId"))
    for track in document["audio"]:
        if not isinstance(track, dict):
            _bad_manifest()
        attachment(track.get("assetId"))
        if track.get("source") is not None:
            audio_source(track["source"], track["assetId"])
        if track.get("segments") is not None:
            segments = track["segments"]
            if not isinstance(segments, list) or not 1 <= len(segments) <= 10_000:
                _bad_manifest()
            charge(len(segments))
            for segment in segments:
                if not isinstance(segment, dict):
                    _bad_manifest()
                attachment(segment.get("assetId"))
                if segment.get("source") is not None:
                    audio_source(segment["source"], segment["assetId"])
    return blobs


def _read_exact(blob_dir, row):
    if not isinstance(row["stored_name"], str) or not STORED_NAME.fullmatch(row["stored_name"]):
        fail(503, "blob_unavailable", "Blob integrity check failed")
    root = descriptor = None
    try:
        root = os.open(blob_dir, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
        descriptor = os.open(row["stored_name"], os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NONBLOCK, dir_fd=root)
        before = os.fstat(descriptor)
        if not stat.S_ISREG(before.st_mode) or before.st_size != row["size"]:
            fail(503, "blob_unavailable", "Blob integrity check failed")
        chunks, count, checksum = [], 0, hashlib.sha256()
        with os.fdopen(descriptor, "rb") as stream:
            descriptor = None
            while True:
                chunk = stream.read(min(CHUNK_BYTES, row["size"] - count + 1))
                if not chunk:
                    break
                count += len(chunk)
                if count > row["size"]:
                    fail(503, "blob_unavailable", "Blob integrity check failed")
                chunks.append(chunk)
                checksum.update(chunk)
            after = os.fstat(stream.fileno())
        if count != row["size"] or checksum.hexdigest() != row["sha256"] or before.st_size != after.st_size or before.st_mtime_ns != after.st_mtime_ns:
            fail(503, "blob_unavailable", "Blob integrity check failed")
        return b"".join(chunks)
    except OSError:
        fail(503, "blob_unavailable", "Blob integrity check failed")
    finally:
        if descriptor is not None:
            os.close(descriptor)
        if root is not None:
            os.close(root)


@dataclass(frozen=True)
class NotebookBlob:
    content: bytes
    media_type: str
    sha256: str


def download(db, policy, token, expected_account, resource_id, blob_id, expected, clock, max_document_bytes):
    authority = RequestAuthority(token, expected_account, None, clock, mutation=False)
    with db.transaction() as connection:
        actor, _ = authority.check(connection)
        resource = connection.execute("SELECT * FROM notebook_resources WHERE id=?", (resource_id,)).fetchone()
        grant = None if resource is None else connection.execute("SELECT * FROM notebook_grants WHERE resource_id=? AND account_id=? AND revoked_at IS NULL", (resource_id, actor)).fetchone()
        if resource is None or resource["owner_account_id"] != actor and grant is None:
            fail(404, "notebook_not_found", "Notebook not found")
        if resource["state"] != "active":
            fail(410, "notebook_inactive", "Notebook is not active")
        access_version = resource["acl_version"] if resource["owner_account_id"] == actor else grant["version"]
        if resource["incarnation"] != expected["incarnation"] or resource["resource_version"] != expected["resource_version"] or access_version != expected["access_version"]:
            fail(409, "notebook_access_changed", "Read the current access descriptor before downloading")
        documents = []
        for kind, field, version in (("whiteboard", "canonical_document_id", "canonical_version"), ("notesMarkdown", "metadata_document_id", "metadata_version")):
            row = connection.execute("SELECT version,content_json,deleted FROM sync_documents WHERE account_id=? AND space_id=? AND document_type=? AND document_id=?", (resource["owner_account_id"], resource["space_id"], kind, resource[field])).fetchone()
            if row is None or row["deleted"] or row["version"] != expected[version] or row["content_json"] is None:
                fail(409, "notebook_source_changed", "Read the current notebook before downloading")
            raw = row["content_json"].encode("utf-8")
            if len(raw) > max_document_bytes:
                _bad_manifest()
            try:
                documents.append({"content": json.loads(_json_text(raw))})
            except (NotebookPayloadError, UnicodeError, json.JSONDecodeError, RecursionError):
                _bad_manifest()
        # Every epoch/version refusal above precedes even the compressed source
        # file read. No stale grant/receipt can turn into a download admission.
        try:
            decoded = decode_notebook_source(connection, policy.blob_dir, owner_account_id=resource["owner_account_id"], space_id=resource["space_id"], content=documents[0]["content"], expected_note_id=resource["note_id"], expected_lineage=resource["lineage"], max_blob_bytes=policy.max_blob_bytes)
        except NotebookPayloadError as failure:
            fail(409, failure.code, failure.message)
        metadata = project_metadata(resource, documents[1]["content"])
        if metadata is None:
            _bad_manifest()
        allowed = _manifest(connection, resource, documents, decoded, policy.max_blob_bytes)
        row = allowed.get(blob_id)
        if row is None:
            fail(404, "notebook_blob_not_found", "Notebook attachment not found")
        authority.check(connection)
        content = _read_exact(policy.blob_dir, row)
        authority.check(connection)
        return NotebookBlob(content, row["media_type"], row["sha256"])


def install_notebook_blob_routes(app, db):
    policy = NotebookPayloadPolicy(app.state.settings.blob_dir, app.state.settings.sync_max_blob_bytes)
    @app.get("/v1/notebooks/{resource_id}/blobs/{blob_id}")
    def blob(resource_id: str, blob_id: str, incarnation: str,
             resource_version: int = Query(ge=1, le=MAX_VERSION), access_version: int = Query(ge=1, le=MAX_VERSION),
             canonical_version: int = Query(ge=1, le=MAX_VERSION), metadata_version: int = Query(ge=1, le=MAX_VERSION),
             dowze_session: str | None = Cookie(default=None), x_dowze_account: str | None = Header(default=None)):
        from .notebook_acl_routes import canonical_uuid
        if not canonical_uuid(resource_id) or not canonical_uuid(incarnation) or not SYNC_ID.fullmatch(blob_id):
            fail(400, "invalid_notebook_identity", "Exact notebook attachment identities are required")
        result = download(db, policy, dowze_session, x_dowze_account, resource_id, blob_id,
                          {"incarnation": incarnation, "resource_version": resource_version, "access_version": access_version, "canonical_version": canonical_version, "metadata_version": metadata_version}, app.state.now, app.state.settings.sync_max_document_bytes)
        return Response(result.content, media_type=result.media_type, headers={"Cache-Control": "no-store", "X-Content-SHA256": result.sha256})
