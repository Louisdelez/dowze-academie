"""Resource-scoped managed writes; candidate only, no ordinary API delegation.

The Node validator runs outside every transaction. Final publication rereads the
complete source pair, resource/grant, immutable blob records and actual file SHA.
Only a successful final native commit exposes a receipt or the new pair.
"""
from __future__ import annotations
from .notebook_metadata import project_metadata


from datetime import datetime, timedelta
import hashlib
import json
import os
import secrets
import stat
import time
from uuid import uuid4

from .notebook_acl import RequestAuthority, MAX_VERSION, fail, _next, _replay, _receipt, timestamp
from .notebook_blobs import _manifest, _blob, MAX_MEDIA_REFERENCES
from .notebook_payload import decode_notebook_source, NotebookPayloadError, SHA256, STORED_NAME, _json_text, _json_object, _invalid_constant
from .notebook_validation import NotebookValidationError
from .sync import canonical_json, request_digest, _account_usage
from .notebook_media_types import managed_blob_media_type

WRITE_PROTOCOL = "dowze-managed-notebook-write@1"
UPLOAD_TTL_SECONDS = 3600
FILE_OPERATION_SECONDS = 20


def _lease(connection, resource_id, actor, expected):
    row = connection.execute("SELECT * FROM notebook_resources WHERE id=?", (resource_id,)).fetchone()
    grant = None if row is None else connection.execute("SELECT * FROM notebook_grants WHERE resource_id=? AND account_id=? AND revoked_at IS NULL", (resource_id, actor)).fetchone()
    if row is None or row["owner_account_id"] != actor and grant is None:
        fail(404, "notebook_not_found", "Notebook not found")
    if row["state"] != "active":
        fail(410, "notebook_inactive", "Notebook is not active")
    if actor != row["owner_account_id"] and grant["role"] != "editor":
        fail(403, "notebook_read_only", "This role cannot change the notebook")
    # The global ACL management CAS is deliberately not the owner's write epoch:
    # inviting an unrelated person must not invalidate the owner's lost ACK.
    version = row["resource_version"] if actor == row["owner_account_id"] else grant["version"]
    if row["incarnation"] != expected["incarnation"] or row["resource_version"] != expected["resource_version"] or version != expected["writer_version"]:
        fail(409, "notebook_access_changed", "Read current managed write authority before retrying")
    return row


def _decode(connection, policy, resource, content):
    try:
        return decode_notebook_source(connection, policy.blob_dir, owner_account_id=resource["owner_account_id"], space_id=resource["space_id"], content=content, expected_note_id=resource["note_id"], expected_lineage=resource["lineage"], max_blob_bytes=policy.max_blob_bytes)
    except NotebookPayloadError as error:
        fail(409, error.code, error.message)


def _sources(connection, settings, resource, body):
    result = []
    for name, kind, identity in (("canonical", "whiteboard", "canonical_document_id"), ("metadata", "notesMarkdown", "metadata_document_id")):
        row = connection.execute("SELECT version,content_json,deleted FROM sync_documents WHERE account_id=? AND space_id=? AND document_type=? AND document_id=?", (resource["owner_account_id"], resource["space_id"], kind, resource[identity])).fetchone()
        if row is None or row["deleted"] or row["content_json"] is None or row["version"] != body[name]["base_version"]:
            fail(409, "notebook_version_conflict", "The source pair changed; keep the local contribution")
        raw = row["content_json"].encode("utf-8")
        if len(raw) > settings.sync_max_document_bytes:
            fail(409, "notebook_source_changed", "The source requires an explicit migration")
        try:
            content = json.loads(_json_text(raw), object_pairs_hook=_json_object, parse_constant=_invalid_constant)
        except (NotebookPayloadError, ValueError, RecursionError):
            fail(409, "notebook_source_changed", "The source could not be verified")
        result.append({"version": row["version"], "content": content, "stored_json": row["content_json"]})
    metadata = project_metadata(resource, result[1]["content"])
    if metadata is None:
        fail(409, "notebook_source_changed", "The metadata identity changed")
    result[1]["content"] = metadata
    return result


def _encoded_pair(settings, body):
    values = []
    for name in ("canonical", "metadata"):
        try:
            raw = canonical_json(body[name]["content"]).encode("utf-8")
        except (ValueError, TypeError, UnicodeError, RecursionError):
            fail(422, "invalid_notebook_state", "A bounded JSON source is required")
        if len(raw) > settings.sync_max_document_bytes:
            fail(413, "document_too_large", "Use the verified compressed notebook body transport")
        if hashlib.sha256(raw).hexdigest() != body[name]["sha256"]:
            fail(422, "hash_mismatch", "The submitted source SHA-256 does not match")
        values.append(raw)
    return values


def _allowed_uploads(connection, resource, actor, expected, current, proposed, now):
    for blob_id in proposed:
        if blob_id in current:
            continue
        upload = connection.execute("SELECT * FROM notebook_uploads WHERE blob_id=? AND resource_id=? AND actor_account_id=?", (blob_id, resource["id"], actor)).fetchone()
        if upload is None:
            fail(422, "notebook_blob_not_admitted", "A new attachment must be uploaded for this resource")
        if upload["incarnation"] != resource["incarnation"] or upload["resource_version"] != resource["resource_version"] or upload["writer_version"] != expected["writer_version"]:
            fail(409, "notebook_upload_authority_changed", "The attachment belongs to an older write authority")
        if datetime.fromisoformat(upload["expires_at"]) <= now:
            fail(410, "notebook_upload_expired", "The original is retained; admit a fresh upload explicitly")


def _admit_body(connection, resource, actor, expected, current, content, now):
    if isinstance(content, dict) and content.get("notebookEnvelope") == 3:
        identity = content.get("body_id")
        if not isinstance(identity, str):
            fail(422, "notebook_blob_not_admitted", "The body requires its own resource-bound upload")
        _allowed_uploads(connection, resource, actor, expected, current, {identity: None}, now)


def _verify_file(blob_dir, row, deadline):
    if not isinstance(row["stored_name"], str) or not STORED_NAME.fullmatch(row["stored_name"]):
        fail(503, "blob_unavailable", "Attachment integrity failed")
    root = descriptor = None
    try:
        root = os.open(blob_dir, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
        descriptor = os.open(row["stored_name"], os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NONBLOCK, dir_fd=root)
        before, digest, count = os.fstat(descriptor), hashlib.sha256(), 0
        if not stat.S_ISREG(before.st_mode) or before.st_size != row["size"]:
            fail(503, "blob_unavailable", "Attachment integrity failed")
        while True:
            if time.monotonic() > deadline:
                fail(503, "notebook_io_budget", "Attachment verification did not finish within the request budget")
            chunk = os.read(descriptor, min(65536, row["size"] - count + 1))
            if not chunk:
                break
            count += len(chunk)
            if count > row["size"]:
                fail(503, "blob_unavailable", "Attachment integrity failed")
            digest.update(chunk)
        after = os.fstat(descriptor)
        if count != row["size"] or digest.hexdigest() != row["sha256"] or before.st_size != after.st_size or before.st_mtime_ns != after.st_mtime_ns:
            fail(503, "blob_unavailable", "Attachment integrity failed")
    except OSError:
        fail(503, "blob_unavailable", "Attachment integrity failed")
    finally:
        if descriptor is not None:
            os.close(descriptor)
        if root is not None:
            os.close(root)


def _history_value(resource, documents, decoded, blobs):
    value = {"protocol": WRITE_PROTOCOL, "incarnation": resource["incarnation"], "lineage": resource["lineage"], "revision": decoded.document["revision"],
             "canonical_document_id": resource["canonical_document_id"], "metadata_document_id": resource["metadata_document_id"],
             "canonical_version": documents[0]["version"], "metadata_version": documents[1]["version"],
             "canonical_sha256": hashlib.sha256(canonical_json(documents[0]["content"]).encode()).hexdigest(),
             "metadata_sha256": hashlib.sha256(canonical_json(documents[1]["content"]).encode()).hexdigest(),
             "blobs": [{name: blobs[identity][name] for name in ("id", "media_type", "size", "sha256")} for identity in sorted(blobs)]}
    return value, canonical_json(value)


def _save_history(connection, resource, history, actor, now, *, sources):
    value, encoded = history
    previous = connection.execute("SELECT manifest_json FROM notebook_versions WHERE resource_id=? AND canonical_version=? AND metadata_version=?", (resource["id"], value["canonical_version"], value["metadata_version"])).fetchone()
    if previous:
        if previous["manifest_json"] != encoded:
            fail(409, "notebook_history_changed", "The retained source manifest no longer matches")
    else:
        connection.execute("INSERT INTO notebook_versions(resource_id,canonical_version,metadata_version,canonical_sha256,metadata_sha256,manifest_json,actor_account_id,created_at) VALUES(?,?,?,?,?,?,?,?)", (resource["id"], value["canonical_version"], value["metadata_version"], value["canonical_sha256"], value["metadata_sha256"], encoded, actor, timestamp(now)))
        for blob in value["blobs"]:
            connection.execute("INSERT INTO notebook_version_blobs(resource_id,canonical_version,metadata_version,blob_id) VALUES(?,?,?,?)", (resource["id"], value["canonical_version"], value["metadata_version"], blob["id"]))
    from .notebook_retention import save_sources
    save_sources(connection, resource, sources, now)


def _usage(connection, owner):
    manifests = int(connection.execute("SELECT COALESCE(sum(length(CAST(v.manifest_json AS BLOB))),0) FROM notebook_versions v JOIN notebook_resources r ON r.id=v.resource_id WHERE r.owner_account_id=?", (owner,)).fetchone()[0])
    sources = int(connection.execute("SELECT COALESCE(sum(s.canonical_source_bytes+s.metadata_source_bytes),0) FROM notebook_version_sources s JOIN notebook_resources r ON r.id=s.resource_id WHERE r.owner_account_id=?", (owner,)).fetchone()[0])
    return _account_usage(connection, owner) + manifests + sources


def publish(db, settings, policy, worker, token, expected_account, csrf, resource_id, body, key, clock):
    authority = RequestAuthority(token, expected_account, csrf, clock)
    # No caller-owned mutable mapping survives admission into the worker gap.
    try:
        body = json.loads(canonical_json(body))
    except (TypeError, ValueError, UnicodeError, RecursionError):
        fail(422, "invalid_notebook_state", "An independent bounded source is required")
    raw = _encoded_pair(settings, body)
    digest = request_digest(WRITE_PROTOCOL, resource_id, canonical_json({name: body[name] for name in ("protocol", "incarnation", "resource_version", "writer_version")}), str(body["canonical"]["base_version"]), body["canonical"]["sha256"], str(body["metadata"]["base_version"]), body["metadata"]["sha256"])
    proposed = [{"content": body[name]["content"]} for name in ("canonical", "metadata")]
    with db.transaction() as connection:
        actor, now = authority.check(connection)
        resource = _lease(connection, resource_id, actor, body)
        replay = _replay(connection, actor, key, resource_id, digest)
        if replay:
            authority.check(connection)
            return replay
        if worker is None:
            fail(503, "notebook_validator_unavailable", "The managed writer requires its pinned validator")
        sources = _sources(connection, settings, resource, body)
        old = _decode(connection, policy, resource, sources[0]["content"])
        old_blobs = _manifest(connection, resource, sources, old, policy.max_blob_bytes)
        _admit_body(connection, resource, actor, body, old_blobs, proposed[0]["content"], now)
        decoded = _decode(connection, policy, resource, proposed[0]["content"])
        proposed_blobs = _manifest(connection, resource, proposed, decoded, policy.max_blob_bytes, verify_stored_refs=False)
        _allowed_uploads(connection, resource, actor, body, old_blobs, proposed_blobs, now)
        authority.check(connection)
        source_hash = request_digest(*(canonical_json(value["content"]) for value in sources))
        canonical, metadata, note_id, lineage = decoded.document, proposed[1]["content"], resource["note_id"], resource["lineage"]
    # No write transaction or DB connection is held during Node/Yjs work.
    try:
        validated = worker.validate(note_id=note_id, lineage=lineage, canonical=canonical, metadata=metadata)
    except NotebookValidationError as error:
        fail(422 if error.invalid else 503, error.code, "The complete notebook validation refused this publication")
    with db.transaction() as connection:
        actor, now = authority.check(connection)
        resource = _lease(connection, resource_id, actor, body)
        replay = _replay(connection, actor, key, resource_id, digest)
        if replay:
            authority.check(connection)
            return replay
        sources = _sources(connection, settings, resource, body)
        if request_digest(*(canonical_json(value["content"]) for value in sources)) != source_hash:
            fail(409, "notebook_source_changed", "The exact captured source pair changed during validation")
        old = _decode(connection, policy, resource, sources[0]["content"])
        old_blobs = _manifest(connection, resource, sources, old, policy.max_blob_bytes)
        _admit_body(connection, resource, actor, body, old_blobs, proposed[0]["content"], now)
        decoded = _decode(connection, policy, resource, proposed[0]["content"])
        if hashlib.sha256(canonical_json(decoded.document).encode()).hexdigest() != validated.canonical_sha256 or hashlib.sha256(canonical_json(proposed[1]["content"]).encode()).hexdigest() != validated.metadata_sha256:
            fail(409, "notebook_source_changed", "The exact validated payload changed before publication")
        proposed_blobs = _manifest(connection, resource, proposed, decoded, policy.max_blob_bytes, verify_stored_refs=False)
        _allowed_uploads(connection, resource, actor, body, old_blobs, proposed_blobs, now)
        old_sha = hashlib.sha256(canonical_json(old.document).encode()).hexdigest()
        if decoded.document["revision"] < old.document["revision"] or decoded.document["revision"] == old.document["revision"] and validated.canonical_sha256 != old_sha:
            fail(409, "notebook_revision_conflict", "A changed canonical graph requires a newer revision")
        deadline = time.monotonic() + FILE_OPERATION_SECONDS
        for row in {**old_blobs, **proposed_blobs}.values():
            _verify_file(policy.blob_dir, row, deadline)
            authority.check(connection)
        next_documents = [{**value, "version": _next(sources[index]["version"]), "stored_json": raw[index].decode("utf-8")} for index, value in enumerate(proposed)]
        histories = [_history_value(resource, sources, old, old_blobs), _history_value(resource, next_documents, decoded, proposed_blobs)]
        extra_history = sum(len(encoded.encode()) for value, encoded in histories if connection.execute("SELECT 1 FROM notebook_versions WHERE resource_id=? AND canonical_version=? AND metadata_version=?", (resource_id, value["canonical_version"], value["metadata_version"])).fetchone() is None)
        from .notebook_retention import source_cost
        extra_sources = source_cost(connection, resource_id, sources) + source_cost(connection, resource_id, next_documents)
        if _usage(connection, resource["owner_account_id"]) + sum(map(len, raw)) + extra_history + extra_sources > settings.sync_account_quota_bytes:
            fail(413, "account_quota_exceeded", "Account storage quota exceeded")
        _, now = authority.check(connection)
        _allowed_uploads(connection, resource, actor, body, old_blobs, proposed_blobs, now)
        changed = timestamp(now)
        _save_history(connection, resource, histories[0], actor, now, sources=sources)
        for index, (kind, field) in enumerate((("whiteboard", "canonical_document_id"), ("notesMarkdown", "metadata_document_id"))):
            item, encoded = next_documents[index], raw[index].decode()
            updated = connection.execute("UPDATE sync_documents SET version=?,content_json=?,content_bytes=?,deleted=0,updated_at=? WHERE account_id=? AND space_id=? AND document_type=? AND document_id=? AND version=? AND content_json=? AND deleted=0", (item["version"], encoded, len(raw[index]), changed, resource["owner_account_id"], resource["space_id"], kind, resource[field], sources[index]["version"], sources[index]["stored_json"]))
            if updated.rowcount != 1:
                fail(409, "notebook_version_conflict", "The exact source changed before its native update")
            connection.execute("DELETE FROM sync_blob_refs WHERE account_id=? AND space_id=? AND document_type=? AND document_id=?", (resource["owner_account_id"], resource["space_id"], kind, resource[field]))
            for blob_id in item["content"].get("blob_ids", []):
                connection.execute("INSERT INTO sync_blob_refs(blob_id,account_id,space_id,document_type,document_id) VALUES(?,?,?,?,?)", (blob_id, resource["owner_account_id"], resource["space_id"], kind, resource[field]))
            connection.execute("INSERT INTO sync_changes(account_id,space_id,document_type,document_id,version,content_json,deleted,changed_at) VALUES(?,?,?,?,?,?,0,?)", (resource["owner_account_id"], resource["space_id"], kind, resource[field], item["version"], encoded, changed))
        _save_history(connection, resource, histories[1], actor, now, sources=next_documents)
        for blob_id in proposed_blobs:
            connection.execute("UPDATE notebook_uploads SET published_at=COALESCE(published_at,?) WHERE blob_id=? AND resource_id=?", (changed, blob_id, resource_id))
        _, now = authority.check(connection)
        payload = {"protocol": WRITE_PROTOCOL, "resource_id": resource_id, "incarnation": resource["incarnation"], "resource_version": resource["resource_version"], "writer_version": body["writer_version"], "actor_account_id": actor, "canonical_version": next_documents[0]["version"], "metadata_version": next_documents[1]["version"], "canonical_sha256": body["canonical"]["sha256"], "metadata_sha256": body["metadata"]["sha256"], "changed_at": timestamp(now)}
        result = _receipt(connection, actor, key, resource_id, digest, 200, payload, now)
    return result


def upload(db, settings, token, expected_account, csrf, resource_id, expected, media_type, expected_sha, body, key, clock):
    authority = RequestAuthority(token, expected_account, csrf, clock)
    if not body or len(body) > settings.sync_max_blob_bytes:
        fail(413, "blob_too_large", "Blob exceeds the managed upload limit")
    if not managed_blob_media_type(media_type):
        fail(415, "unsupported_media_type", "Blob media type is not supported")
    checksum = hashlib.sha256(body).hexdigest()
    if not isinstance(expected_sha, str) or not SHA256.fullmatch(expected_sha) or checksum != expected_sha:
        fail(422, "hash_mismatch", "Blob SHA-256 does not match")
    digest = request_digest("notebook-upload@1", resource_id, canonical_json(expected), media_type, expected_sha, body)
    root, created, committed = None, [], False
    try:
        with db.transaction() as connection:
            actor, now = authority.check(connection)
            resource = _lease(connection, resource_id, actor, expected)
            previous_upload = connection.execute("SELECT expires_at FROM notebook_uploads WHERE actor_account_id=? AND receipt_key=? AND resource_id=?", (actor, key, resource_id)).fetchone()
            if previous_upload is not None and datetime.fromisoformat(previous_upload["expires_at"]) <= now:
                fail(410, "notebook_upload_expired", "The retained upload needs a new explicit admission")
            replay = _replay(connection, actor, key, resource_id, digest)
            if replay:
                row = connection.execute("SELECT * FROM notebook_uploads WHERE blob_id=? AND resource_id=? AND actor_account_id=?", (replay[1]["id"], resource_id, actor)).fetchone()
                _, now = authority.check(connection)
                if row is None or datetime.fromisoformat(row["expires_at"]) <= now:
                    fail(410, "notebook_upload_expired", "The retained upload needs a new explicit admission")
                _verify_file(settings.blob_dir, _blob(connection, resource, row["blob_id"], settings.sync_max_blob_bytes), time.monotonic() + FILE_OPERATION_SECONDS)
                _, now = authority.check(connection)
                if datetime.fromisoformat(row["expires_at"]) <= now:
                    fail(410, "notebook_upload_expired", "The retained upload expired during integrity verification")
                return replay
            if _usage(connection, resource["owner_account_id"]) + len(body) > settings.sync_account_quota_bytes:
                fail(413, "account_quota_exceeded", "Account storage quota exceeded")
            settings.blob_dir.mkdir(parents=True, exist_ok=True)
            root = os.open(settings.blob_dir, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
            stored_name, blob_id = secrets.token_hex(32) + ".blob", str(uuid4())
            temporary = stored_name + ".tmp"
            descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600, dir_fd=root)
            created.append(temporary)
            try:
                written, deadline = 0, time.monotonic() + FILE_OPERATION_SECONDS
                while written < len(body):
                    if time.monotonic() > deadline:
                        fail(503, "notebook_io_budget", "Upload persistence exceeded its request budget")
                    count = os.write(descriptor, body[written:written + 65536])
                    if count <= 0:
                        fail(503, "blob_unavailable", "The original could not be persisted")
                    written += count
                os.fsync(descriptor)
            finally:
                os.close(descriptor)
            os.link(temporary, stored_name, src_dir_fd=root, dst_dir_fd=root, follow_symlinks=False)
            created.append(stored_name)
            os.unlink(temporary, dir_fd=root)
            created.remove(temporary)
            os.fsync(root)
            _verify_file(settings.blob_dir, {"stored_name": stored_name, "size": len(body), "sha256": checksum}, time.monotonic() + FILE_OPERATION_SECONDS)
            _, now = authority.check(connection)
            created_at, expires_at = timestamp(now), timestamp(now + timedelta(seconds=UPLOAD_TTL_SECONDS))
            connection.execute("INSERT INTO sync_blobs(id,account_id,space_id,stored_name,media_type,size,sha256,created_at) VALUES(?,?,?,?,?,?,?,?)", (blob_id, resource["owner_account_id"], resource["space_id"], stored_name, media_type, len(body), checksum, created_at))
            connection.execute("INSERT INTO notebook_uploads(blob_id,resource_id,actor_account_id,incarnation,resource_version,writer_version,receipt_key,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?)", (blob_id, resource_id, actor, resource["incarnation"], resource["resource_version"], expected["writer_version"], key, created_at, expires_at))
            _, now = authority.check(connection)
            if datetime.fromisoformat(expires_at) <= now:
                fail(410, "notebook_upload_expired", "The upload expired before its receipt could be accepted")
            result = _receipt(connection, actor, key, resource_id, digest, 201, {"id": blob_id, "resource_id": resource_id, "incarnation": resource["incarnation"], "resource_version": resource["resource_version"], "writer_version": expected["writer_version"], "media_type": media_type, "size": len(body), "sha256": checksum, "created_at": created_at, "expires_at": expires_at}, now)
        committed = True
        return result
    except OSError:
        fail(503, "blob_unavailable", "The original could not be persisted")
    finally:
        if root is not None:
            try:
                if not committed:
                    for name in created:
                        os.unlink(name, dir_fd=root)
                    if created:
                        os.fsync(root)
            finally:
                os.close(root)
