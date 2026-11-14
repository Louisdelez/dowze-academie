"""Private PUT adapter for a NEW explicit N025 codec declaration.

SOURCE candidate only. The header is a compatibility declaration, never actor,
ACL, session or build authentication. Node is outside both transactions. This
file does not alter delete/tombstone/lifecycle or the managed publication paths.
"""
import copy
from dataclasses import dataclass
import hashlib

from . import sync
from .notebook_acl import RequestAuthority, fail, private_write_is_managed
from .notebook_style_sources import (STYLE_FEATURE, StyleSourceError, StyleSources,
    inspect_private_style_capture, _content, _snapshot, _known_graph, _decode_graph)
from .notebook_payload import MAX_NOTEBOOK_BYTES, _identity
from .notebook_metadata import canonical_document_id, metadata_document_id, project_metadata
from .notebook_validation import NotebookValidationError



@dataclass(frozen=True)
class PrivateDocumentStyles:
    account_id: str
    space_id: str
    document_type: str
    document_id: str
    current: StyleSources
    proposed: StyleSources
    row: tuple | None
    blobs: tuple


def _group(connection, blob_dir, account, space, kind, identity, value, raw, blobs):
    """The private route key is authority, not a manufactured derived pair.

    Canonical can precede metadata. Historical private document IDs need not be
    a derivation of noteId. Each known gzip body must still match its own claimed
    noteId/revision/digest/references in this exact authenticated owner scope.
    This is not a substitute for explicit-ID managed/admission pair validation.
    """
    markdowns, body_hashes = [], ()
    if value is not None and kind == "whiteboard" and _known_graph(value):
        if not _identity(value.get("noteId")):
            raise StyleSourceError("style_source_identity")
        graph, body_hashes = _decode_graph(connection, blob_dir, account, space,
                                          value["noteId"], value, blobs)
        for item in graph["objects"]:
            if isinstance(item, dict) and item.get("kind") in ("text", "sticky"):
                markdown = item.get("markdown", "")
                if not isinstance(markdown, str):
                    raise StyleSourceError("style_source_graph")
                markdowns.append(markdown)
    elif value is not None and kind == "notesMarkdown":
        note = value
        if "notebookMetadataTransport" in value:
            logical = value.get("logicalId")
            if not _identity(logical):
                raise StyleSourceError("style_source_identity")
            # This existing typed envelope explicitly binds its route identity;
            # ordinary historical metadata below does not invent such a rule.
            resource = {"owner_account_id": account, "space_id": space, "note_id": logical,
                        "canonical_document_id": canonical_document_id(logical),
                        "metadata_document_id": identity}
            note = project_metadata(resource, value)
            if note is None or identity != metadata_document_id(logical):
                raise StyleSourceError("style_source_metadata")
        markdown = note.get("markdown")
        if isinstance(markdown, str):
            markdowns.append(markdown)
    # Other historical private JSON shapes have no N025 active block source.
    # No source is rewritten, and retained legacy/history/Yjs data is ignored.
    try:
        if len(markdowns) > 100001 or sum(len(text.encode("utf-8")) for text in markdowns) > MAX_NOTEBOOK_BYTES:
            raise StyleSourceError("style_source_budget")
        hashes = () if raw is None else (hashlib.sha256(raw.encode("utf-8")).hexdigest(),)
    except UnicodeError as error:
        raise StyleSourceError("style_source_json") from error
    return StyleSources(hashes + body_hashes, tuple(markdowns))


def capture_document_styles(connection, blob_dir, *, account_id, space_id,
                            document_type, document_id, proposed_content):
    """One exact private row, not an implicit canonical/metadata pair.

    Session/account/space/route validation belongs to the HTTP caller. All rows
    and gzip file references remain scoped to that actor and requested route.
    """
    row = connection.execute("SELECT * FROM sync_documents WHERE account_id=? AND space_id=? AND document_type=? AND document_id=?",
                             (account_id, space_id, document_type, document_id)).fetchone()
    current = _content(row)
    current_raw = None if row is None or row["deleted"] else row["content_json"]
    proposed_raw = sync.canonical_json(proposed_content)
    blobs = {}
    before = _group(connection, blob_dir, account_id, space_id, document_type, document_id,
                    current, current_raw, blobs)
    after = _group(connection, blob_dir, account_id, space_id, document_type, document_id,
                   proposed_content, proposed_raw, blobs)
    return PrivateDocumentStyles(account_id, space_id, document_type, document_id,
                                  before, after, _snapshot(row), tuple(sorted(blobs.items())))


def _codec(values):
    # Exact single declaration only. Missing, duplicate, combined, padded or
    # unknown values cannot claim support; they do not affect unstyled notes.
    return STYLE_FEATURE if isinstance(values, tuple) and values == (STYLE_FEATURE,) else None


def _source_error(error):
    if error.code == "document_update_required":
        fail(409, "document_update_required", "This notebook requires an updated editor before it can be changed")
    if error.code == "style_inspector_unavailable":
        fail(503, "notebook_style_inspector_unavailable", "The pinned notebook compatibility inspector is unavailable")
    if error.code == "style_source_budget":
        fail(413, "notebook_style_source_budget", "The notebook compatibility source exceeds its bounded budget")
    fail(409, "notebook_style_source_unverified", "The exact notebook compatibility source could not be verified")


def put_private_document(db, settings, worker, token, expected_account, csrf,
                         space_id, document_type, document_id, base_version,
                         content, key, clock, *, advertised_codecs=()):
    """The authenticated HTTP owner remains the only source of account scope.

    Existing private policy, replay, size/version/quota/blob checks are repeated
    before reading the feature sources, then run again by the same old writer.
    The feature gate rejects without adding any failure receipt or source write.
    """
    if document_type not in ("whiteboard", "notesMarkdown"):
        raise ValueError("private paper HTTP adapter requires a closed type")
    try:
        encoded = sync.canonical_json(content).encode("utf-8")
        # Retain an independent request value. Existing private PUT serializes
        # with canonical_json; preserve its exact bytes while removing aliases.
        proposed = copy.deepcopy(content)
        if sync.canonical_json(proposed).encode("utf-8") != encoded:
            fail(409, "notebook_style_source_changed", "The exact proposed request changed during capture")
        blob_ids = sync._blob_ids(proposed)
    except (TypeError, ValueError):
        return 400, {"code": "invalid_document", "message": "Document content is invalid"}
    authority = RequestAuthority(token, expected_account, csrf, clock)
    digest = sync.request_digest("put", space_id, document_type, document_id, str(base_version), encoded)
    try:
        with db.transaction() as connection:
            actor, now = authority.check(connection)
            if private_write_is_managed(connection, actor, space_id, document_type, document_id):
                return 409, {"code": "managed_notebook_protocol_required", "message": "Use the explicitly admitted managed notebook adapter"}
            replay = sync._stored_result(connection, actor, key, digest)
            if replay:
                authority.check(connection)
                return replay  # Exact old receipt; no source is written again.
            if not sync.space_exists(connection, actor, space_id):
                return sync._save_result(connection, actor, key, digest, 404, {"code": "space_not_found", "message": "Annual space not found"}, now)
            if len(encoded) > settings.sync_max_document_bytes:
                return sync._save_result(connection, actor, key, digest, 413, {"code": "document_too_large", "message": "Document exceeds UTF-8 size limit"}, now)
            row = connection.execute("SELECT version,content_bytes FROM sync_documents WHERE account_id=? AND space_id=? AND document_type=? AND document_id=?", (actor, space_id, document_type, document_id)).fetchone()
            version = row["version"] if row else 0
            if version != base_version:
                return sync._save_result(connection, actor, key, digest, 409, {"code": "version_conflict", "message": "Base version does not match", "current_version": version}, now)
            if sync._account_usage(connection, actor) + len(encoded) > settings.sync_account_quota_bytes:
                return sync._save_result(connection, actor, key, digest, 413, {"code": "account_quota_exceeded", "message": "Account storage quota exceeded"}, now)
            for blob_id in blob_ids:
                row = connection.execute("SELECT 1 FROM sync_blobs WHERE id=? AND account_id=? AND space_id=?", (blob_id, actor, space_id)).fetchone()
                if row is None:
                    return sync._save_result(connection, actor, key, digest, 422, {"code": "invalid_blob_reference", "message": "Blob is unavailable in this annual space"}, now)
            captured = capture_document_styles(connection, settings.blob_dir,
                account_id=actor, space_id=space_id, document_type=document_type,
                document_id=document_id, proposed_content=proposed)
            authority.check(connection)
        # No database transaction or connection is held during real AST work.
        requirements = inspect_private_style_capture(worker, captured)
        codec = _codec(advertised_codecs)
        # The cached result is evaluated only after final live authority and
        # exact recapture, including on a compatibility rejection after Node.
    except StyleSourceError as error:
        _source_error(error)
    except NotebookValidationError as error:
        fail(422 if error.invalid else 503, error.code, "The pinned notebook compatibility inspector refused this request")

    def authority_check(connection):
        _actor, now = authority.check(connection)
        return now

    def commit_check(connection):
        authority.check(connection)
        try:
            latest = capture_document_styles(connection, settings.blob_dir,
                account_id=expected_account, space_id=space_id, document_type=document_type,
                document_id=document_id, proposed_content=proposed)
            if latest != captured:
                fail(409, "notebook_style_source_changed", "The exact private notebook source changed during compatibility inspection")
        except StyleSourceError as error:
            _source_error(error)
        # Capture can read bounded gzip bytes; sample the real clock again after
        # those reads, immediately before the unchanged durable writer begins.
        _actor, now = authority.check(connection)
        if any(requirements) and codec != STYLE_FEATURE:
            fail(409, "document_update_required", "This notebook requires an updated editor before it can be changed")
        return now

    return sync.put_document(db, expected_account, space_id, document_type, document_id,
        base_version, proposed, key, clock(), settings.sync_max_document_bytes,
        settings.sync_account_quota_bytes, authority_check=authority_check,
        style_commit_check=commit_check)
