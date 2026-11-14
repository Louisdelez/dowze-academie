"""N025 compatibility at the existing managed publication boundary.

Read-only capture; no actor, ACL or writer authority is conferred here. The
caller retains its original lease, full graph validation, replay and native CAS.
Registration/admission/lifecycle that preserve sources are not editor writes.
"""
from dataclasses import dataclass

from .notebook_acl import fail
from .notebook_style_sources import (STYLE_FEATURE, StyleSourceError, StyleSources,
    _content, _json, _snapshot, _group, inspect_private_style_capture)
from .notebook_private_styles import _codec, _source_error


@dataclass(frozen=True)
class ManagedPublicationStyles:
    boundary: tuple
    current: StyleSources
    proposed: StyleSources
    rows: tuple
    blobs: tuple


# The existing owner write epoch deliberately excludes unrelated ACL edits.
# Match that contract; _lease remains authoritative for actor/grant permissions.
_BOUNDARY = ("id", "owner_account_id", "space_id", "note_id",
             "canonical_document_id", "metadata_document_id", "incarnation",
             "resource_version", "lineage")


def capture_managed_styles(connection, blob_dir, resource, raw_pair):
    """Exact explicit-ID pair, including full SQL rows and verified gzip bodies.

    raw_pair is retained immutable publication input, not a projection of the
    proposed metadata. Typed metadata retains its existing identity binding.
    Node never runs here and the helper never writes or selects another owner.
    """
    try:
        if not isinstance(raw_pair, tuple) or len(raw_pair) != 2 or any(not isinstance(raw, str) for raw in raw_pair):
            raise StyleSourceError("style_source_json")
        rows = [connection.execute(
            "SELECT * FROM sync_documents WHERE account_id=? AND space_id=? AND document_type=? AND document_id=?",
            (resource["owner_account_id"], resource["space_id"], kind, resource[field]),
        ).fetchone() for kind, field in (("whiteboard", "canonical_document_id"), ("notesMarkdown", "metadata_document_id"))]
        if any(row is None or row["deleted"] or row["content_json"] is None for row in rows):
            raise StyleSourceError("style_source_changed")
        current = [_content(row) for row in rows]
        proposed = [_json(raw) for raw in raw_pair]
        blobs = {}
        before = _group(connection, blob_dir, resource, current,
                        [row["content_json"] for row in rows], blobs)
        after = _group(connection, blob_dir, resource, proposed, raw_pair, blobs)
        return ManagedPublicationStyles(tuple((name, resource[name]) for name in _BOUNDARY),
            before, after, tuple(_snapshot(row) for row in rows), tuple(sorted(blobs.items())))
    except StyleSourceError as error:
        _source_error(error)


def inspect_managed_styles(worker, captured):
    # Same pinned real AST as private PUT; a marker prefix alone is never proof.
    try:
        return inspect_private_style_capture(worker, captured)
    except StyleSourceError as error:
        _source_error(error)


def recapture_managed_styles(connection, blob_dir, resource, raw_pair, captured):
    if capture_managed_styles(connection, blob_dir, resource, raw_pair) != captured:
        fail(409, "notebook_style_source_changed", "The exact managed notebook source changed during compatibility inspection")


def require_managed_style_codec(requirements, advertised_codecs):
    # Evaluate only after final live authority and exact source recapture.
    # A complete explicit removal still requires a client that read the style.
    if any(requirements) and _codec(advertised_codecs) != STYLE_FEATURE:
        fail(409, "document_update_required", "This notebook requires an updated editor before it can be changed")
