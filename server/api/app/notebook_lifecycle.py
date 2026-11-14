"""Owner-only soft deletion/restoration of one exact managed source pair.

Trash records, complete sources, media pins, two monotone sync tombstones, ACL
revocations and receipt commit together. Restoration is a distinct operation:
the retained pair is validated by the actual TS/Yjs worker outside the TX, then
reread under its current authority/expiry/tombstone CAS. Nothing is purged and
no old grant is revived. SQL source strings are never reconstructed from JSON.
"""
from .notebook_metadata import project_metadata

from datetime import datetime, timedelta
import hashlib
import time

from .notebook_acl import RequestAuthority, fail, timestamp, _next, _replay, _receipt
from .notebook_blobs import _manifest
from .notebook_retention import _retained, source_cost
from .notebook_validation import NotebookValidationError
from .notebook_wire import _load, _uuid, MAX_VERSION, MAX_SOURCE_BYTES, ManagedWireError, parse_source
from .notebook_writes import (_sources, _decode, _verify_file, _history_value,
                              _save_history, _usage, FILE_OPERATION_SECONDS)
from .sync import canonical_json, request_digest

PROTOCOL = "dowze-managed-notebook-lifecycle@1"
RETENTION_SECONDS = 30 * 86400
MAX_REQUEST_BYTES = 4096
MAX_TRASH_CYCLES = 1000
PAIR = (("canonical", "whiteboard", "canonical_document_id"),
        ("metadata", "notesMarkdown", "metadata_document_id"))


def parse_request(raw):
    if not isinstance(raw, bytes) or not 0 < len(raw) <= MAX_REQUEST_BYTES:
        fail(413, "notebook_lifecycle_budget", "The lifecycle request exceeds its explicit byte budget")
    try:
        value = _load(raw)
    except ManagedWireError:
        fail(422, "invalid_notebook_lifecycle", "The exact lifecycle request was refused")
    expected = {"protocol", "incarnation", "resource_version", "writer_version", "canonical_version", "metadata_version"}
    if set(value) != expected or value["protocol"] != PROTOCOL or not _uuid(value["incarnation"]) or any(type(value[name]) is not int or not 1 <= value[name] <= MAX_VERSION for name in expected - {"protocol", "incarnation"}):
        fail(422, "invalid_notebook_lifecycle", "The exact lifecycle authority and pair versions are required")
    # Independent primitives, materialized before any lock/worker gap.
    return {name: value[name] for name in sorted(expected)}


def _owner(connection, resource_id, actor, incarnation):
    row = connection.execute("SELECT * FROM notebook_resources WHERE id=? AND owner_account_id=?", (resource_id, actor)).fetchone()
    if row is None:
        fail(404, "notebook_not_found", "Notebook not found")
    if row["incarnation"] != incarnation:
        fail(409, "notebook_incarnation_changed", "The current notebook incarnation is required")
    if row["state"] == "purged":
        fail(410, "notebook_inactive", "The notebook is no longer restorable")
    return row


def _epoch(resource, expected, state):
    if resource["state"] != state:
        fail(410, "notebook_inactive", "This lifecycle operation requires its explicit current state")
    if resource["resource_version"] != expected["resource_version"] or expected["writer_version"] != resource["resource_version"]:
        fail(409, "notebook_access_changed", "The current lifecycle authority is required")


def _cycle(connection, resource, version):
    row = connection.execute("SELECT * FROM notebook_trash_cycles WHERE resource_id=? AND trash_resource_version=?", (resource["id"], version)).fetchone()
    if row is None or row["incarnation"] != resource["incarnation"]:
        fail(409, "notebook_trash_changed", "The exact trash cycle is unavailable")
    return row


def _expiry(authority, connection, cycle):
    actor, now = authority.check(connection)
    if datetime.fromisoformat(cycle["restore_until"]) <= now:
        fail(410, "notebook_restore_expired", "The server retention period has ended; no source was purged by this request")
    return actor, now


def _pair_rows(connection, resource):
    result = []
    for _, kind, field in PAIR:
        row = connection.execute("SELECT version,content_json,content_bytes,deleted FROM sync_documents WHERE account_id=? AND space_id=? AND document_type=? AND document_id=?", (resource["owner_account_id"], resource["space_id"], kind, resource[field])).fetchone()
        if row is None:
            fail(409, "notebook_source_changed", "The exact source pair no longer exists")
        result.append(row)
    return result


def _tombstones(connection, resource, cycle, expected):
    versions = (cycle["canonical_tombstone_version"], cycle["metadata_tombstone_version"])
    if tuple(expected[name + "_version"] for name, _, _ in PAIR) != versions:
        fail(409, "notebook_version_conflict", "The exact tombstone pair is required")
    for row, version in zip(_pair_rows(connection, resource), versions):
        if row["version"] != version or row["deleted"] != 1 or row["content_json"] is not None or row["content_bytes"] != 0:
            fail(409, "notebook_version_conflict", "The source pair changed after trash admission")
    for _, kind, field in PAIR:
        if connection.execute("SELECT 1 FROM sync_blob_refs WHERE account_id=? AND space_id=? AND document_type=? AND document_id=?", (resource["owner_account_id"], resource["space_id"], kind, resource[field])).fetchone():
            fail(409, "notebook_version_conflict", "The exact tombstone no longer has an empty media reference set")


def _verify_files(connection, authority, blobs, policy, cycle=None):
    deadline = time.monotonic() + FILE_OPERATION_SECONDS
    for row in blobs.values():
        _verify_file(policy.blob_dir, row, deadline)
        if cycle is None:
            authority.check(connection)
        else:
            _expiry(authority, connection, cycle)


def _snapshot(connection, settings, policy, resource, cycle):
    source, manifest, blobs = _retained(connection, settings, policy, resource, cycle["source_canonical_version"], cycle["source_metadata_version"])
    if source["canonical_source_sha256"] != cycle["canonical_source_sha256"] or source["metadata_source_sha256"] != cycle["metadata_source_sha256"] or hashlib.sha256(canonical_json(manifest).encode()).hexdigest() != cycle["manifest_sha256"]:
        fail(503, "notebook_retained_source_corrupt", "The exact trash snapshot changed")
    documents = []
    for name, _, _ in PAIR:
        try:
            parsed = parse_source(source[name + "_source_json"], source[name + "_source_sha256"], max_bytes=min(settings.sync_max_document_bytes, MAX_SOURCE_BYTES))
            content = parsed.load()
        except ManagedWireError:
            fail(503, "notebook_retained_source_corrupt", "The retained source cannot be validated")
        documents.append({"version": cycle["source_" + name + "_version"], "content": content, "stored_json": parsed.source_json})
    metadata = project_metadata(resource, documents[1]["content"])
    if metadata is None:
        fail(503, "notebook_retained_source_corrupt", "The retained metadata identity changed")
    documents[1]["content"] = metadata
    return documents, manifest, blobs, _decode(connection, policy, resource, documents[0]["content"])


def _replay_current(connection, actor, key, resource, expected, action, digest, authority):
    # Revalidate current actor/resource/nonce/epoch/state BEFORE the old receipt.
    # The sole accepted alternate epoch is exactly the result of this operation.
    state = "trashed" if action == "trash" else "active"
    if resource["state"] != state or resource["resource_version"] != expected["resource_version"] + 1 or expected["writer_version"] != expected["resource_version"]:
        return None
    cycle = _cycle(connection, resource, resource["resource_version"] if action == "trash" else expected["resource_version"])
    if action == "trash":
        _expiry(authority, connection, cycle)
        if (cycle["source_canonical_version"], cycle["source_metadata_version"]) != (expected["canonical_version"], expected["metadata_version"]):
            fail(409, "notebook_version_conflict", "The trash source pair changed")
        _tombstones(connection, resource, cycle, {"canonical_version": cycle["canonical_tombstone_version"], "metadata_version": cycle["metadata_tombstone_version"]})
    else:
        if cycle["restored_resource_version"] != resource["resource_version"] or (cycle["canonical_tombstone_version"], cycle["metadata_tombstone_version"]) != (expected["canonical_version"], expected["metadata_version"]):
            fail(409, "notebook_trash_changed", "The restore result is no longer current")
        for row, name in zip(_pair_rows(connection, resource), ("canonical", "metadata")):
            if row["deleted"] != 0 or row["version"] != cycle["restored_" + name + "_version"] or not isinstance(row["content_json"], str) or hashlib.sha256(row["content_json"].encode()).hexdigest() != cycle[name + "_source_sha256"]:
                fail(409, "notebook_version_conflict", "The exact restore result is no longer current")
    replay = _replay(connection, actor, key, resource["id"], digest)
    if replay:
        authority.check(connection)
    return replay


def _revoke_all(connection, resource, now):
    changed = timestamp(now)
    for row in connection.execute("SELECT account_id,version FROM notebook_grants WHERE resource_id=? AND revoked_at IS NULL", (resource["id"],)).fetchall():
        connection.execute("UPDATE notebook_grants SET version=?,revoked_at=?,updated_at=? WHERE resource_id=? AND account_id=? AND version=? AND revoked_at IS NULL", (_next(row["version"]), changed, changed, resource["id"], row["account_id"], row["version"]))
    for row in connection.execute("SELECT id,version FROM notebook_invitations WHERE resource_id=? AND state<>'revoked'", (resource["id"],)).fetchall():
        connection.execute("UPDATE notebook_invitations SET state='revoked',version=?,updated_at=? WHERE id=? AND version=?", (_next(row["version"]), changed, row["id"], row["version"]))


def _update_resource(connection, resource, state, now):
    version, acl = _next(resource["resource_version"]), _next(resource["acl_version"])
    cursor = connection.execute("UPDATE notebook_resources SET state=?,resource_version=?,acl_version=?,updated_at=? WHERE id=? AND incarnation=? AND state=? AND resource_version=? AND acl_version=?", (state, version, acl, timestamp(now), resource["id"], resource["incarnation"], resource["state"], resource["resource_version"], resource["acl_version"]))
    if cursor.rowcount != 1:
        fail(409, "notebook_access_changed", "The lifecycle epoch changed before publication")
    return version, acl


def _payload(resource, actor, action, version, acl, documents, now, cycle):
    return {"protocol": PROTOCOL, "action": action, "resource_id": resource["id"], "incarnation": resource["incarnation"], "actor_account_id": actor,
            "state": "trashed" if action == "trash" else "active", "resource_version": version, "acl_version": acl,
            "writer_version": version, "canonical_version": documents[0], "metadata_version": documents[1],
            "canonical_source_sha256": cycle["canonical_source_sha256"], "metadata_source_sha256": cycle["metadata_source_sha256"],
            "trashed_at": cycle["trashed_at"], "restore_until": cycle["restore_until"], "changed_at": timestamp(now)}


def trash(db, settings, policy, token, expected_account, csrf, resource_id, body, key, clock):
    body = dict(body)
    authority = RequestAuthority(token, expected_account, csrf, clock)
    digest = request_digest(PROTOCOL, "trash", resource_id, canonical_json(body))
    with db.transaction() as connection:
        actor, now = authority.check(connection)
        resource = _owner(connection, resource_id, actor, body["incarnation"])
        replay = _replay_current(connection, actor, key, resource, body, "trash", digest, authority)
        if replay:
            return replay
        _epoch(resource, body, "active")
        _replay(connection, actor, key, resource_id, digest)  # reject cross-kind/key reuse
        if connection.execute("SELECT count(*) FROM notebook_trash_cycles WHERE resource_id=?", (resource_id,)).fetchone()[0] >= MAX_TRASH_CYCLES:
            fail(429, "notebook_lifecycle_capacity", "The lifecycle history capacity requires an explicit migration")
        sources = _sources(connection, settings, resource, {name: {"base_version": body[name + "_version"]} for name, _, _ in PAIR})
        decoded = _decode(connection, policy, resource, sources[0]["content"])
        blobs = _manifest(connection, resource, sources, decoded, policy.max_blob_bytes)
        _verify_files(connection, authority, blobs, policy)
        history = _history_value(resource, sources, decoded, blobs)
        extra = source_cost(connection, resource_id, sources)
        if connection.execute("SELECT 1 FROM notebook_versions WHERE resource_id=? AND canonical_version=? AND metadata_version=?", (resource_id, sources[0]["version"], sources[1]["version"])).fetchone() is None:
            extra += len(history[1].encode())
        if _usage(connection, actor) + extra > settings.sync_account_quota_bytes:
            fail(413, "account_quota_exceeded", "Retaining the complete trash source exceeds account quota")
        _, now = authority.check(connection)
        _save_history(connection, resource, history, actor, now, sources=sources)
        next_versions = [_next(value["version"]) for value in sources]
        cycle = {"resource_id": resource_id, "incarnation": resource["incarnation"], "trash_resource_version": _next(resource["resource_version"]),
                 "source_canonical_version": sources[0]["version"], "source_metadata_version": sources[1]["version"],
                 "canonical_tombstone_version": next_versions[0], "metadata_tombstone_version": next_versions[1],
                 "canonical_source_sha256": hashlib.sha256(sources[0]["stored_json"].encode()).hexdigest(), "metadata_source_sha256": hashlib.sha256(sources[1]["stored_json"].encode()).hexdigest(),
                 "manifest_sha256": hashlib.sha256(history[1].encode()).hexdigest(), "trashed_at": timestamp(now), "restore_until": timestamp(now + timedelta(seconds=RETENTION_SECONDS))}
        fields = tuple(cycle)
        connection.execute("INSERT INTO notebook_trash_cycles(" + ",".join(fields) + ") VALUES(" + ",".join("?" for _ in fields) + ")", tuple(cycle.values()))
        for index, (_, kind, field) in enumerate(PAIR):
            source = sources[index]
            cursor = connection.execute("UPDATE sync_documents SET version=?,content_json=NULL,content_bytes=0,deleted=1,updated_at=? WHERE account_id=? AND space_id=? AND document_type=? AND document_id=? AND version=? AND content_json=? AND deleted=0", (next_versions[index], timestamp(now), actor, resource["space_id"], kind, resource[field], source["version"], source["stored_json"]))
            if cursor.rowcount != 1:
                fail(409, "notebook_version_conflict", "The exact source changed before trash publication")
            connection.execute("DELETE FROM sync_blob_refs WHERE account_id=? AND space_id=? AND document_type=? AND document_id=?", (actor, resource["space_id"], kind, resource[field]))
            connection.execute("INSERT INTO sync_changes(account_id,space_id,document_type,document_id,version,content_json,deleted,changed_at) VALUES(?,?,?,?,?,NULL,1,?)", (actor, resource["space_id"], kind, resource[field], next_versions[index], timestamp(now)))
        _revoke_all(connection, resource, now)
        version, acl = _update_resource(connection, resource, "trashed", now)
        _, now = _expiry(authority, connection, cycle)
        result = _receipt(connection, actor, key, resource_id, digest, 200, _payload(resource, actor, "trash", version, acl, next_versions, now, cycle), now)
    return result


def restore(db, settings, policy, worker, token, expected_account, csrf, resource_id, body, key, clock):
    body = dict(body)
    authority = RequestAuthority(token, expected_account, csrf, clock)
    digest = request_digest(PROTOCOL, "restore", resource_id, canonical_json(body))
    with db.transaction() as connection:
        actor, _ = authority.check(connection)
        resource = _owner(connection, resource_id, actor, body["incarnation"])
        replay = _replay_current(connection, actor, key, resource, body, "restore", digest, authority)
        if replay:
            return replay
        _epoch(resource, body, "trashed")
        cycle = _cycle(connection, resource, body["resource_version"])
        _expiry(authority, connection, cycle)
        _tombstones(connection, resource, cycle, body)
        _replay(connection, actor, key, resource_id, digest)
        if worker is None:
            fail(503, "notebook_validator_unavailable", "Restoration requires the pinned complete notebook validator")
        documents, _, blobs, decoded = _snapshot(connection, settings, policy, resource, cycle)
        _verify_files(connection, authority, blobs, policy, cycle)
        before = canonical_json(dict(cycle))
        note_id, lineage = resource["note_id"], resource["lineage"]
        canonical, metadata = decoded.document, documents[1]["content"]
        _expiry(authority, connection, cycle)
    try:
        validated = worker.validate(note_id=note_id, lineage=lineage, canonical=canonical, metadata=metadata)
    except NotebookValidationError as error:
        fail(422 if error.invalid else 503, error.code, "The complete notebook validator refused restoration")
    with db.transaction() as connection:
        actor, _ = authority.check(connection)
        resource = _owner(connection, resource_id, actor, body["incarnation"])
        replay = _replay_current(connection, actor, key, resource, body, "restore", digest, authority)
        if replay:
            return replay
        _epoch(resource, body, "trashed")
        cycle = _cycle(connection, resource, body["resource_version"])
        _expiry(authority, connection, cycle)
        if canonical_json(dict(cycle)) != before:
            fail(409, "notebook_trash_changed", "The captured trash cycle changed during validation")
        _tombstones(connection, resource, cycle, body)
        documents, _, blobs, decoded = _snapshot(connection, settings, policy, resource, cycle)
        if hashlib.sha256(canonical_json(decoded.document).encode()).hexdigest() != validated.canonical_sha256 or hashlib.sha256(canonical_json(documents[1]["content"]).encode()).hexdigest() != validated.metadata_sha256:
            fail(409, "notebook_source_changed", "The exact validated restore pair changed")
        _verify_files(connection, authority, blobs, policy, cycle)
        next_documents = [{**value, "version": _next(body[name + "_version"])} for value, (name, _, _) in zip(documents, PAIR)]
        history = _history_value(resource, next_documents, decoded, blobs)
        # Match the existing account quota model: sync_changes bytes plus the
        # independent retained source/manifest; current rows are not double counted.
        raw_cost = sum(len(value["stored_json"].encode()) for value in documents)
        extra = raw_cost + len(history[1].encode()) + source_cost(connection, resource_id, next_documents)
        if _usage(connection, actor) + extra > settings.sync_account_quota_bytes:
            fail(413, "account_quota_exceeded", "The exact restored pair exceeds account quota")
        _, now = _expiry(authority, connection, cycle)
        for value, (name, kind, field) in zip(next_documents, PAIR):
            raw = value["stored_json"]
            cursor = connection.execute("UPDATE sync_documents SET version=?,content_json=?,content_bytes=?,deleted=0,updated_at=? WHERE account_id=? AND space_id=? AND document_type=? AND document_id=? AND version=? AND content_json IS NULL AND content_bytes=0 AND deleted=1", (value["version"], raw, len(raw.encode()), timestamp(now), actor, resource["space_id"], kind, resource[field], body[name + "_version"]))
            if cursor.rowcount != 1:
                fail(409, "notebook_version_conflict", "The exact tombstone changed before restore publication")
            for blob_id in value["content"].get("blob_ids", []):
                connection.execute("INSERT INTO sync_blob_refs(blob_id,account_id,space_id,document_type,document_id) VALUES(?,?,?,?,?)", (blob_id, actor, resource["space_id"], kind, resource[field]))
            connection.execute("INSERT INTO sync_changes(account_id,space_id,document_type,document_id,version,content_json,deleted,changed_at) VALUES(?,?,?,?,?,?,0,?)", (actor, resource["space_id"], kind, resource[field], value["version"], raw, timestamp(now)))
        _save_history(connection, resource, history, actor, now, sources=next_documents)
        version, acl = _update_resource(connection, resource, "active", now)
        cursor = connection.execute("UPDATE notebook_trash_cycles SET restored_at=?,restored_resource_version=?,restored_canonical_version=?,restored_metadata_version=? WHERE resource_id=? AND trash_resource_version=? AND incarnation=? AND restored_at IS NULL", (timestamp(now), version, next_documents[0]["version"], next_documents[1]["version"], resource_id, cycle["trash_resource_version"], resource["incarnation"]))
        if cursor.rowcount != 1:
            fail(409, "notebook_trash_changed", "The trash cycle was already restored")
        _, now = _expiry(authority, connection, cycle)
        result = _receipt(connection, actor, key, resource_id, digest, 200, _payload(resource, actor, "restore", version, acl, [value["version"] for value in next_documents], now, cycle), now)
    return result


def read_lifecycle(db, token, expected_account, resource_id, incarnation, clock):
    authority = RequestAuthority(token, expected_account, None, clock, mutation=False)
    with db.transaction() as connection:
        actor, now = authority.check(connection)
        resource = _owner(connection, resource_id, actor, incarnation)
        pair = _pair_rows(connection, resource)
        cycle = _cycle(connection, resource, resource["resource_version"]) if resource["state"] == "trashed" else None
        if cycle is not None:
            _tombstones(connection, resource, cycle, {name + "_version": row["version"] for row, (name, _, _) in zip(pair, PAIR)})
        _, now = authority.check(connection)
        result = {"protocol": PROTOCOL, "resource_id": resource_id, "incarnation": resource["incarnation"], "actor_account_id": actor, "state": resource["state"], "resource_version": resource["resource_version"], "writer_version": resource["resource_version"], "acl_version": resource["acl_version"], "canonical_version": pair[0]["version"], "metadata_version": pair[1]["version"], "retention_seconds": RETENTION_SECONDS, "restore_until": cycle["restore_until"] if cycle is not None else None,
                  "can_restore": cycle is not None and datetime.fromisoformat(cycle["restore_until"]) > now}
    return result
