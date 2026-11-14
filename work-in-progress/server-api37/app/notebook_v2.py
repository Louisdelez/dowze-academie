"""Explicit v2 capabilities and exact current pair reads; isolated candidate.

No caller chooses an owner account or gets an owner-space listing. The source
proof is read-only and conveys no future publication authority: admission must
reread both exact rows and perform the raw-SHA/version CAS under its transaction.
"""
from __future__ import annotations
from .notebook_metadata import project_metadata


import hashlib
import time

from .notebook_acl import RequestAuthority, _descriptor, _replay, _receipt, timestamp, fail
from .notebook_blobs import _manifest, MAX_SHARED_BLOB_BYTES, MAX_MEDIA_REFERENCES
from .notebook_payload import (
    MAX_NOTEBOOK_BYTES, MAX_COMPRESSED_BYTES, MAX_JSON_DEPTH, MAX_DECODE_STEPS,
    MAX_EXPANSION_RATIO, SYNC_ID,
)
from .notebook_validation import NotebookValidationWorker
from .notebook_wire import (
    SOURCE_CODEC, WRITE_PROTOCOL, MAX_SOURCE_BYTES, MAX_PACKET_BYTES, MAX_NODES,
    MAX_VERSION, ManagedWireError, parse_source, _load, _uuid,
)
from .notebook_writes import _decode, _verify_file, FILE_OPERATION_SECONDS
from .sync import request_digest

CAPABILITIES_PROTOCOL = "dowze-managed-notebook-capabilities@1"
PROOF_PROTOCOL = "dowze-managed-notebook-admission-proof@2"
REGISTRATION_PROTOCOL = "dowze-managed-notebook-register@2"
READ_PROTOCOL = "dowze-managed-notebook-state@2"
MAX_ADMISSION_BYTES = 65_536


def wire_limits(settings):
    source = min(settings.sync_max_document_bytes, MAX_SOURCE_BYTES)
    return {"source_bytes": source, "packet_bytes": min(4 * source + 65_536, MAX_PACKET_BYTES),
            "admission_packet_bytes": min(settings.max_request_bytes, MAX_ADMISSION_BYTES),
            "decoded_notebook_bytes": MAX_NOTEBOOK_BYTES, "compressed_notebook_bytes": MAX_COMPRESSED_BYTES,
            "blob_bytes": min(settings.sync_max_blob_bytes, MAX_SHARED_BLOB_BYTES),
            "blob_references": MAX_MEDIA_REFERENCES, "json_depth": MAX_JSON_DEPTH,
            "json_nodes": MAX_NODES, "gzip_steps": MAX_DECODE_STEPS, "gzip_expansion_ratio": MAX_EXPANSION_RATIO}


def capabilities(db, settings, worker, token, expected_account, clock):
    authority = RequestAuthority(token, expected_account, None, clock, mutation=False)
    with db.transaction() as connection:
        actor, _ = authority.check(connection)
        # PG runtime never performs DDL. Do not advertise v2 merely because its
        # Python routes exist while the explicitly provisioned schema is absent.
        probes = (
            "SELECT id,incarnation,resource_version,acl_version FROM notebook_resources LIMIT 0",
            "SELECT incarnation,resource_id,packet_sha256 FROM notebook_admission_nonces LIMIT 0",
            "SELECT resource_id,account_id,role,version,revoked_at FROM notebook_grants LIMIT 0",
            "SELECT actor_account_id,request_hash,response_json FROM notebook_receipts LIMIT 0",
            "SELECT resource_id,writer_version,expires_at FROM notebook_uploads LIMIT 0",
            "SELECT resource_id,canonical_version,metadata_version,manifest_json FROM notebook_versions LIMIT 0",
            "SELECT resource_id,blob_id FROM notebook_version_blobs LIMIT 0",
            "SELECT resource_id,canonical_source_json,metadata_source_sha256 FROM notebook_version_sources LIMIT 0",
            "SELECT resource_id,trash_resource_version,restore_until FROM notebook_trash_cycles LIMIT 0",
        )
        try:
            for query in probes:
                connection.execute(query)
        except Exception:
            fail(503, "notebook_protocol_unavailable", "The explicit managed v2 schema is unavailable")
        result = {"protocol": CAPABILITIES_PROTOCOL, "actor_account_id": actor,
                  "descriptor_protocol": "dowze-managed-notebook@1", "source_codec": SOURCE_CODEC,
                  "registration_protocol": REGISTRATION_PROTOCOL, "proof_protocol": PROOF_PROTOCOL,
                  "state_protocol": READ_PROTOCOL, "write_protocol": WRITE_PROTOCOL,
                  "upload_protocol": "notebook-upload@1", "raw_packet_utf8_required": True,
                  "lifecycle_protocol": "dowze-managed-notebook-lifecycle@1", "trash_retention_seconds": 30 * 86400,
                  "lifecycle_roles": ["owner"], "physical_purge_supported": False,
                  "lifecycle_request_bytes": 4096, "lifecycle_cycles_per_resource": 1000,
                  "writer_configured": isinstance(worker, NotebookValidationWorker),
                  "roles": {"read": ["owner", "editor", "commenter", "viewer"], "write": ["owner", "editor"]},
                  "endpoints": {"proofs": "/v1/notebook-admission-proofs", "admission": "/v1/notebooks/{resource_id}/admission",
                                "state_read": "/v1/notebooks/{resource_id}/state", "state_write": "/v1/notebooks/{resource_id}/state-v2",
                                "trash": "/v1/notebooks/{resource_id}/trash", "restore": "/v1/notebooks/{resource_id}/restore",
                                "lifecycle": "/v1/notebooks/{resource_id}/lifecycle"},
                  "limits": wire_limits(settings)}
        authority.check(connection)
        return result


def _identity(value):
    if not isinstance(value, str) or not value or any(ord(character) < 32 for character in value):
        return False
    try:
        return len(value.encode("utf-16-be")) // 2 <= 200
    except UnicodeError:
        return False


def source_identity(value):
    names = ("space_id", "note_id", "canonical_document_id", "metadata_document_id", "lineage")
    if not isinstance(value, dict) or set(value) != set(names):
        fail(400, "invalid_notebook_identity", "The exact private pair identities are required")
    # Independent strings captured before acquiring a possibly contended lock.
    result = {name: value[name] for name in names}
    if any(not isinstance(result[name], str) or not SYNC_ID.fullmatch(result[name]) for name in ("space_id", "canonical_document_id", "metadata_document_id")) or not _identity(result["note_id"]) or not _identity(result["lineage"]):
        fail(400, "invalid_notebook_identity", "The exact private pair identities are invalid")
    return result


def _pair(connection, settings, resource):
    result = []
    for kind, field in (("whiteboard", "canonical_document_id"), ("notesMarkdown", "metadata_document_id")):
        row = connection.execute("SELECT version,content_json,deleted FROM sync_documents WHERE account_id=? AND space_id=? AND document_type=? AND document_id=?", (resource["owner_account_id"], resource["space_id"], kind, resource[field])).fetchone()
        if row is None or row["deleted"] or type(row["version"]) is not int or not 1 <= row["version"] <= MAX_VERSION or not isinstance(row["content_json"], str):
            fail(409, "notebook_source_changed", "The exact source pair is unavailable")
        try:
            if len(row["content_json"]) > min(settings.sync_max_document_bytes, MAX_SOURCE_BYTES):
                raise ManagedWireError("managed_json_budget")
            raw = row["content_json"].encode("utf-8", errors="strict")
            parsed = parse_source(row["content_json"], hashlib.sha256(raw).hexdigest(), max_bytes=min(settings.sync_max_document_bytes, MAX_SOURCE_BYTES))
        except (ManagedWireError, UnicodeError):
            fail(409, "notebook_source_changed", "The exact source pair requires an explicit migration")
        result.append({"version": row["version"], "content": parsed.load(), "stored_json": parsed.source_json, "source_sha256": parsed.sha256})
    metadata = project_metadata(resource, result[1]["content"])
    if metadata is None:
        fail(409, "notebook_source_changed", "The metadata belongs to a different notebook")
    result[1]["content"] = metadata
    return result


def _verified_pair(connection, settings, policy, resource, authority):
    documents = _pair(connection, settings, resource)
    decoded = _decode(connection, policy, resource, documents[0]["content"])
    blobs = _manifest(connection, resource, documents, decoded, policy.max_blob_bytes)
    deadline = time.monotonic() + FILE_OPERATION_SECONDS
    for blob in blobs.values():
        _verify_file(policy.blob_dir, blob, deadline)
        authority.check(connection)
    authority.check(connection)
    return documents, blobs


def _proofs(documents):
    return {name: {"version": value["version"], "source_json": value["stored_json"], "sha256": value["source_sha256"]}
            for name, value in zip(("canonical", "metadata"), documents)}


def _read_access(connection, resource_id, actor, expected):
    # The v1 _resource source bypass is deliberately restricted to owner revoke.
    # This read has its own gate so every expected epoch precedes actual I/O.
    resource = connection.execute("SELECT * FROM notebook_resources WHERE id=?", (resource_id,)).fetchone()
    grant = None if resource is None else connection.execute("SELECT * FROM notebook_grants WHERE resource_id=? AND account_id=? AND revoked_at IS NULL", (resource_id, actor)).fetchone()
    if resource is None or resource["owner_account_id"] != actor and grant is None:
        fail(404, "notebook_not_found", "Notebook not found")
    if resource["state"] != "active":
        fail(410, "notebook_inactive", "The current notebook is not active")
    access = resource["acl_version"] if actor == resource["owner_account_id"] else grant["version"]
    if resource["incarnation"] != expected["incarnation"] or resource["resource_version"] != expected["resource_version"] or access != expected["access_version"]:
        fail(409, "notebook_access_changed", "Read the current managed authority before receiving the pair")
    return resource, grant


def admission_proofs(db, settings, policy, token, expected_account, identity, clock):
    identity = source_identity(identity)
    authority = RequestAuthority(token, expected_account, None, clock, mutation=False)
    with db.transaction() as connection:
        actor, _ = authority.check(connection)
        if connection.execute("SELECT 1 FROM notebook_resources WHERE owner_account_id=? AND space_id=? AND (canonical_document_id=? OR metadata_document_id=? OR note_id=?)", (actor, identity["space_id"], identity["canonical_document_id"], identity["metadata_document_id"], identity["note_id"])).fetchone():
            fail(409, "notebook_identity_exists", "Read the existing managed binding instead of readmitting it")
        resource = {**identity, "owner_account_id": actor}
        documents, _ = _verified_pair(connection, settings, policy, resource, authority)
        authority.check(connection)
        return {"protocol": PROOF_PROTOCOL, "source_codec": SOURCE_CODEC, "actor_account_id": actor,
                **identity, **_proofs(documents)}


def read_state(db, settings, policy, token, expected_account, resource_id, expected, clock):
    # Copies are scalars only; no caller-owned dict crosses the DB lock gap.
    expected = {name: expected[name] for name in ("incarnation", "resource_version", "access_version")}
    authority = RequestAuthority(token, expected_account, None, clock, mutation=False)
    with db.transaction() as connection:
        actor, _ = authority.check(connection)
        resource, grant = _read_access(connection, resource_id, actor, expected)
        documents, blobs = _verified_pair(connection, settings, policy, resource, authority)
        authority.check(connection)
        return {"protocol": READ_PROTOCOL, "source_codec": SOURCE_CODEC, "actor_account_id": actor,
                "resource": _descriptor(resource, actor, grant), **_proofs(documents),
                "blobs": [{name: blob[name] for name in ("id", "media_type", "size", "sha256")} for blob in blobs.values()]}


def _registration_packet(packet_json, maximum):
    if not isinstance(packet_json, str) or len(packet_json) > maximum:
        fail(413, "request_too_large", "The admission packet exceeds its bound")
    try:
        raw = packet_json.encode("utf-8", errors="strict")
        if len(raw) > maximum:
            fail(413, "request_too_large", "The admission packet exceeds its bound")
        body = _load(raw)
    except (UnicodeError, ManagedWireError):
        fail(422, "invalid_managed_admission", "An exact strict JSON admission packet is required")
    identity_names = ("space_id", "note_id", "canonical_document_id", "metadata_document_id", "lineage")
    if set(body) != {"protocol", "source_codec", "private_write_policy", "incarnation", "canonical", "metadata", *identity_names} or body["protocol"] != REGISTRATION_PROTOCOL or body["source_codec"] != SOURCE_CODEC or body["private_write_policy"] != "managed-only" or not _uuid(body["incarnation"]):
        fail(422, "invalid_managed_admission", "The v2 admission identity and source codec are required")
    source_identity({name: body[name] for name in identity_names})
    for name in ("canonical", "metadata"):
        value = body[name]
        if not isinstance(value, dict) or set(value) != {"version", "sha256"} or type(value["version"]) is not int or not 1 <= value["version"] <= MAX_VERSION or not isinstance(value["sha256"], str) or len(value["sha256"]) != 64 or any(character not in "0123456789abcdef" for character in value["sha256"]):
            fail(422, "invalid_managed_admission", "Exact source versions and raw UTF-8 hashes are required")
    return body, hashlib.sha256(raw).hexdigest()


def register_v2(db, settings, policy, token, expected_account, csrf, resource_id, packet_json, key, clock):
    body, packet_sha = _registration_packet(packet_json, min(settings.max_request_bytes, MAX_ADMISSION_BYTES))
    if body["incarnation"] == resource_id:
        fail(422, "invalid_managed_admission", "Admission nonce and resource identity must be distinct")
    identity = source_identity({name: body[name] for name in ("space_id", "note_id", "canonical_document_id", "metadata_document_id", "lineage")})
    digest = request_digest(REGISTRATION_PROTOCOL, resource_id, packet_sha)
    authority = RequestAuthority(token, expected_account, csrf, clock)
    with db.transaction() as connection:
        actor, now = authority.check(connection)
        existing = connection.execute("SELECT * FROM notebook_resources WHERE id=?", (resource_id,)).fetchone()
        if existing is not None:
            if existing["owner_account_id"] != actor:
                fail(404, "notebook_not_found", "Notebook not found")
            if existing["state"] != "active":
                fail(410, "notebook_inactive", "The retired resource cannot be readmitted")
            if existing["incarnation"] != body["incarnation"] or existing["resource_version"] != 1 or any(existing[name] != value for name, value in identity.items()):
                fail(409, "notebook_admission_changed", "The captured admission incarnation or source identity changed")
            reservation = connection.execute("SELECT * FROM notebook_admission_nonces WHERE incarnation=?", (body["incarnation"],)).fetchone()
            if reservation is None or reservation["resource_id"] != resource_id or reservation["owner_account_id"] != actor:
                fail(409, "notebook_admission_changed", "This source was not admitted by the captured v2 intent")
            # Current source/clock verification precedes receipt lookup too; an
            # old admission receipt is never a readable-document authority.
            _verified_pair(connection, settings, policy, existing, authority)
            replay = _replay(connection, actor, key, resource_id, digest)
            if replay:
                authority.check(connection)
                return replay
            fail(409, "notebook_exists", "The notebook already has a managed admission")
        if connection.execute("SELECT 1 FROM notebook_admission_nonces WHERE incarnation=? OR resource_id=?", (body["incarnation"], resource_id)).fetchone() or connection.execute("SELECT 1 FROM notebook_resources WHERE incarnation=?", (body["incarnation"],)).fetchone():
            fail(409, "notebook_incarnation_reserved", "The admission nonce cannot be reused or rotated")
        _replay(connection, actor, key, resource_id, digest)
        if connection.execute("SELECT 1 FROM notebook_resources WHERE owner_account_id=? AND space_id=? AND (canonical_document_id=? OR metadata_document_id=? OR note_id=?)", (actor, identity["space_id"], identity["canonical_document_id"], identity["metadata_document_id"], identity["note_id"])).fetchone():
            fail(409, "notebook_identity_exists", "The private source already belongs to a managed resource")
        resource = {"id": resource_id, "owner_account_id": actor, **identity}
        documents = _pair(connection, settings, resource)
        for name, document in zip(("canonical", "metadata"), documents):
            if document["version"] != body[name]["version"] or document["source_sha256"] != body[name]["sha256"]:
                fail(409, "notebook_source_changed", "The exact private source pair changed after preflight")
        created = timestamp(now)
        resource.update(incarnation=body["incarnation"], state="active", resource_version=1, acl_version=1, created_at=created, updated_at=created)
        fields = ("id", "incarnation", "owner_account_id", "space_id", "note_id", "canonical_document_id", "metadata_document_id", "lineage", "state", "resource_version", "acl_version", "created_at", "updated_at")
        connection.execute("INSERT INTO notebook_resources(" + ",".join(fields) + ") VALUES(" + ",".join("?" for _ in fields) + ")", tuple(resource[name] for name in fields))
        connection.execute("INSERT INTO notebook_admission_nonces(incarnation,resource_id,owner_account_id,packet_sha256,created_at) VALUES(?,?,?,?,?)", (body["incarnation"], resource_id, actor, packet_sha, created))
        from .notebook_retention import capture_admission
        capture_admission(connection, settings, policy, resource, body, actor, authority)
        _, now = authority.check(connection)
        result = {"protocol": REGISTRATION_PROTOCOL, "source_codec": SOURCE_CODEC,
                  "actor_account_id": actor, "resource_id": resource_id, "incarnation": resource["incarnation"],
                  "resource_version": 1, **identity, "canonical_version": documents[0]["version"],
                  "metadata_version": documents[1]["version"], "canonical_source_sha256": documents[0]["source_sha256"],
                  "metadata_source_sha256": documents[1]["source_sha256"], "packet_sha256": packet_sha,
                  "created_at": timestamp(now)}
        response = _receipt(connection, actor, key, resource_id, digest, 201, result, now)
    return response
