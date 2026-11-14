"""v2 exact raw-source publication; v1 writer and its historical proofs are unchanged.

The shared authorization/media/validator/retention helpers are the reviewed 4c
implementations. No private writer, owner account switch or JSON re-encoding is
used for publication or replay. Node still runs outside every DB transaction.
"""
from .notebook_metadata import project_metadata
from .notebook_managed_styles import (capture_managed_styles, inspect_managed_styles,
    recapture_managed_styles, require_managed_style_codec)

import hashlib
import time

from .notebook_acl import RequestAuthority, fail, _next, _replay, _receipt, timestamp
from .notebook_blobs import _manifest
from .notebook_validation import NotebookValidationError
from .notebook_wire import SOURCE_CODEC, WRITE_PROTOCOL, MAX_SOURCE_BYTES, MAX_PACKET_BYTES, ManagedWireError, parse_write_packet
from .notebook_writes import (_lease, _sources, _decode, _admit_body, _allowed_uploads, _verify_file,
                              _history_value, _save_history, _usage, FILE_OPERATION_SECONDS)
from .sync import canonical_json, request_digest


def publish_v2(db, settings, policy, worker, token, expected_account, csrf, resource_id, packet_json, key, clock, *, advertised_codecs=()):
    try:
        packet = parse_write_packet(packet_json, max_source_bytes=min(settings.sync_max_document_bytes, MAX_SOURCE_BYTES), max_packet_bytes=min(4 * settings.sync_max_document_bytes + 65_536, MAX_PACKET_BYTES))
    except ManagedWireError as error:
        fail(413 if error.code == "managed_json_budget" else 422, error.code, "The exact managed UTF-8 packet was refused")
    # Immutable strings are retained. Only independent parsed views enter the
    # existing semantic validator/helpers; they never replace the raw SQL source.
    raw = [value.source_json.encode("utf-8") for value in (packet.canonical, packet.metadata)]
    body = {"protocol": WRITE_PROTOCOL, "incarnation": packet.incarnation, "resource_version": packet.resource_version,
            "writer_version": packet.writer_version,
            "canonical": {"base_version": packet.canonical_version, "sha256": packet.canonical.sha256, "content": packet.canonical.load()},
            "metadata": {"base_version": packet.metadata_version, "sha256": packet.metadata.sha256, "content": packet.metadata.load()}}
    authority = RequestAuthority(token, expected_account, csrf, clock)
    digest = request_digest(WRITE_PROTOCOL, resource_id, packet.packet_sha256)
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
        metadata = project_metadata(resource, proposed[1]["content"])
        if metadata is None:
            fail(422, "notebook_metadata_invalid", "The exact metadata identity is required")
        proposed[1]["content"] = metadata
        sources = _sources(connection, settings, resource, body)
        old = _decode(connection, policy, resource, sources[0]["content"])
        old_blobs = _manifest(connection, resource, sources, old, policy.max_blob_bytes)
        _admit_body(connection, resource, actor, body, old_blobs, proposed[0]["content"], now)
        decoded = _decode(connection, policy, resource, proposed[0]["content"])
        proposed_blobs = _manifest(connection, resource, proposed, decoded, policy.max_blob_bytes, verify_stored_refs=False)
        _allowed_uploads(connection, resource, actor, body, old_blobs, proposed_blobs, now)
        authority.check(connection)
        source_hash = request_digest(*(value["stored_json"] for value in sources))
        canonical, metadata, note_id, lineage = decoded.document, proposed[1]["content"], resource["note_id"], resource["lineage"]
        style_raw_pair = tuple(value.decode("utf-8") for value in raw)
        style_capture = capture_managed_styles(connection, policy.blob_dir, resource, style_raw_pair)
        authority.check(connection)
    # No write transaction or DB connection is held during Node/Yjs work.
    try:
        validated = worker.validate(note_id=note_id, lineage=lineage, canonical=canonical, metadata=metadata)
        style_requirements = inspect_managed_styles(worker, style_capture)
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
        if request_digest(*(value["stored_json"] for value in sources)) != source_hash:
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
        recapture_managed_styles(connection, policy.blob_dir, resource, style_raw_pair, style_capture)
        _, now = authority.check(connection)
        require_managed_style_codec(style_requirements, advertised_codecs)
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
        payload = {"protocol": WRITE_PROTOCOL, "source_codec": SOURCE_CODEC, "resource_id": resource_id,
                   "incarnation": resource["incarnation"], "resource_version": resource["resource_version"],
                   "writer_version": packet.writer_version, "actor_account_id": actor,
                   "canonical_base_version": packet.canonical_version, "metadata_base_version": packet.metadata_version,
                   "canonical_version": next_documents[0]["version"], "metadata_version": next_documents[1]["version"],
                   "canonical_source_sha256": packet.canonical.sha256, "metadata_source_sha256": packet.metadata.sha256,
                   "packet_sha256": packet.packet_sha256, "changed_at": timestamp(now)}
        result = _receipt(connection, actor, key, resource_id, digest, 200, payload, now)
    return result

