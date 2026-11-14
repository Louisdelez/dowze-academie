"""Exact retained sources, independent of the mutable sync_changes journal.

These are owner recovery inputs, not permission snapshots or automatically
accepted new mutations. Source dates, revisions and JSON bytes are not repaired.
"""
from __future__ import annotations
from .notebook_metadata import project_metadata


import hashlib
import json
import time

from .notebook_acl import RequestAuthority, fail, timestamp
from .notebook_payload import NotebookPayloadError, _json_text, _json_object, _invalid_constant
from .notebook_blobs import _manifest, _read_exact
from .sync import canonical_json

PROTOCOL = "dowze-notebook-retained-source@1"


def source_pair(documents):
    result = []
    for document in documents:
        raw = document["stored_json"]
        if not isinstance(raw, str):
            fail(409, "notebook_retained_source_unavailable", "The exact source JSON was not captured")
        try:
            encoded = raw.encode("utf-8")
        except UnicodeError:
            fail(409, "notebook_retained_source_unavailable", "The exact source cannot be represented as UTF-8")
        result.append((raw, len(encoded), hashlib.sha256(encoded).hexdigest()))
    return result


def source_cost(connection, resource_id, documents):
    existing = connection.execute("SELECT 1 FROM notebook_version_sources WHERE resource_id=? AND canonical_version=? AND metadata_version=?", (resource_id, documents[0]["version"], documents[1]["version"])).fetchone()
    return 0 if existing else sum(value[1] for value in source_pair(documents))


def save_sources(connection, resource, documents, now):
    pair = source_pair(documents)
    canonical = documents[0]["content"]
    codec = "gzip" if canonical.get("notebookEnvelope") == 3 else "inline"
    body_id = canonical["body_id"] if codec == "gzip" else None
    values = {"canonical_source_json": pair[0][0], "metadata_source_json": pair[1][0], "canonical_source_bytes": pair[0][1], "metadata_source_bytes": pair[1][1], "canonical_source_sha256": pair[0][2], "metadata_source_sha256": pair[1][2], "canonical_codec": codec, "body_id": body_id}
    existing = connection.execute("SELECT * FROM notebook_version_sources WHERE resource_id=? AND canonical_version=? AND metadata_version=?", (resource["id"], documents[0]["version"], documents[1]["version"])).fetchone()
    if existing:
        if any(existing[name] != value for name, value in values.items()):
            fail(409, "notebook_retained_source_changed", "The retained source is immutable")
        return
    # Only callers holding these exact live/new sources may capture them. There
    # is deliberately no fallback to sync_changes or an inferred old version.
    fields = tuple(values)
    connection.execute("INSERT INTO notebook_version_sources(resource_id,canonical_version,metadata_version," + ",".join(fields) + ",captured_at) VALUES(" + ",".join("?" for _ in range(len(fields) + 4)) + ")", (resource["id"], documents[0]["version"], documents[1]["version"], *values.values(), timestamp(now)))


def capture_admission(connection, settings, policy, resource, proofs, actor, authority):
    from .notebook_writes import _sources, _decode, _verify_file, _history_value, _save_history, _usage, FILE_OPERATION_SECONDS
    if settings is None or policy is None:
        fail(503, "notebook_retention_unavailable", "Managed admission requires its explicit retention policy")
    versions = {name: {"base_version": proofs[name]["version"]} for name in ("canonical", "metadata")}
    documents = _sources(connection, settings, resource, versions)
    decoded = _decode(connection, policy, resource, documents[0]["content"])
    blobs = _manifest(connection, resource, documents, decoded, policy.max_blob_bytes)
    deadline = time.monotonic() + FILE_OPERATION_SECONDS
    for row in blobs.values():
        _verify_file(policy.blob_dir, row, deadline)
        authority.check(connection)
    history = _history_value(resource, documents, decoded, blobs)
    cost = len(history[1].encode("utf-8")) + source_cost(connection, resource["id"], documents)
    if _usage(connection, resource["owner_account_id"]) + cost > settings.sync_account_quota_bytes:
        fail(413, "account_quota_exceeded", "Retaining the complete original pair exceeds account quota")
    _, now = authority.check(connection)
    _save_history(connection, resource, history, actor, now, sources=documents)


def _owner(connection, resource_id, actor, expected):
    row = connection.execute("SELECT * FROM notebook_resources WHERE id=? AND owner_account_id=?", (resource_id, actor)).fetchone()
    if row is None:
        fail(404, "notebook_not_found", "Notebook not found")
    if row["state"] != "active":
        fail(410, "notebook_inactive", "Notebook lifecycle requires its explicit recovery operation")
    if row["incarnation"] != expected["incarnation"] or row["resource_version"] != expected["resource_version"]:
        fail(409, "notebook_access_changed", "The current notebook incarnation is required")
    return row


def _retained(connection, settings, policy, resource, canonical_version, metadata_version):
    from .notebook_writes import _decode, _history_value
    history = connection.execute("SELECT * FROM notebook_versions WHERE resource_id=? AND canonical_version=? AND metadata_version=?", (resource["id"], canonical_version, metadata_version)).fetchone()
    source = connection.execute("SELECT * FROM notebook_version_sources WHERE resource_id=? AND canonical_version=? AND metadata_version=?", (resource["id"], canonical_version, metadata_version)).fetchone()
    if history is None or source is None:
        fail(409, "notebook_retained_source_unavailable", "No independent complete source pair was captured for this version")
    documents = []
    for name, version in (("canonical", canonical_version), ("metadata", metadata_version)):
        raw = source[name + "_source_json"]
        try:
            encoded = raw.encode("utf-8")
            if len(encoded) != source[name + "_source_bytes"] or not 0 < len(encoded) <= settings.sync_max_document_bytes or hashlib.sha256(encoded).hexdigest() != source[name + "_source_sha256"]:
                raise ValueError("retained source SHA")
            value = json.loads(_json_text(encoded), object_pairs_hook=_json_object, parse_constant=_invalid_constant)
        except (NotebookPayloadError, ValueError, UnicodeError, RecursionError, AttributeError):
            fail(503, "notebook_retained_source_corrupt", "The exact retained source could not be verified")
        documents.append({"version": version, "content": value, "stored_json": raw})
    decoded = _decode(connection, policy, resource, documents[0]["content"])
    metadata = project_metadata(resource, documents[1]["content"])
    if metadata is None:
        fail(503, "notebook_retained_source_corrupt", "Retained metadata identity changed")
    documents[1]["content"] = metadata
    if source["canonical_codec"] != ("gzip" if decoded.body_id else "inline") or source["body_id"] != decoded.body_id:
        fail(503, "notebook_retained_source_corrupt", "Retained codec/body identity changed")
    blobs = _manifest(connection, resource, documents, decoded, policy.max_blob_bytes, verify_stored_refs=False)
    value, encoded_manifest = _history_value(resource, documents, decoded, blobs)
    pins = {row["blob_id"] for row in connection.execute("SELECT blob_id FROM notebook_version_blobs WHERE resource_id=? AND canonical_version=? AND metadata_version=?", (resource["id"], canonical_version, metadata_version))}
    if encoded_manifest != history["manifest_json"] or value["canonical_sha256"] != history["canonical_sha256"] or value["metadata_sha256"] != history["metadata_sha256"] or pins != set(blobs):
        fail(503, "notebook_retained_source_corrupt", "The complete retained pair/media manifest changed")
    return source, value, blobs


def read_snapshot(db, settings, policy, token, expected_account, resource_id, canonical_version, metadata_version, expected, clock, *, blob_id=None):
    from .notebook_writes import _verify_file, FILE_OPERATION_SECONDS
    authority = RequestAuthority(token, expected_account, None, clock, mutation=False)
    with db.transaction() as connection:
        actor, _ = authority.check(connection)
        resource = _owner(connection, resource_id, actor, expected)
        source, manifest, blobs = _retained(connection, settings, policy, resource, canonical_version, metadata_version)
        if blob_id is not None and blob_id not in blobs:
            fail(404, "notebook_blob_not_found", "This retained snapshot does not own that attachment")
        deadline = time.monotonic() + FILE_OPERATION_SECONDS
        for row in blobs.values():
            _verify_file(policy.blob_dir, row, deadline)
            authority.check(connection)
        if blob_id is not None:
            row = blobs[blob_id]
            content = _read_exact(policy.blob_dir, row)
            authority.check(connection)
            return {"bytes": content, "media_type": row["media_type"], "sha256": row["sha256"]}
        authority.check(connection)
        return {"protocol": PROTOCOL, "purpose": "owner-recovery-input", "mutation_validation": "required-before-publication", "resource_id": resource_id, "incarnation": resource["incarnation"], "resource_version": resource["resource_version"], "canonical_version": canonical_version, "metadata_version": metadata_version,
                "canonical_source_json": source["canonical_source_json"], "metadata_source_json": source["metadata_source_json"], "canonical_source_sha256": source["canonical_source_sha256"], "metadata_source_sha256": source["metadata_source_sha256"], "canonical_codec": source["canonical_codec"], "body_id": source["body_id"], "captured_at": source["captured_at"], "blobs": manifest["blobs"]}
