"""Read-only private source capture for the N025 writer compatibility fence.

The caller authenticates the actor and owns its transaction. This helper grants
no access, chooses no other owner, writes nothing and runs no Markdown parser.
Only the separately pinned real TypeScript parser may bind a style to a block.
"""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
from pathlib import Path

from .notebook_metadata import canonical_document_id, metadata_document_id, project_metadata
from .notebook_payload import (MAX_NOTEBOOK_BYTES, MAX_COMPRESSED_BYTES, MAX_BLOB_REFERENCES,
                               MAX_SAFE_INTEGER, SYNC_ID, SHA256, NotebookPayloadError,
                               _identity, _integer, _read_gzip, _json_text, _json_object, _invalid_constant)
from .sync import canonical_json

STYLE_FEATURE = "paper-text-style:v1"
STYLE_PREFIX = "<!-- dowze-text-style:v1 "


class StyleSourceError(ValueError):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def _fail(code="style_source_unverified"):
    raise StyleSourceError(code)


def _json(raw):
    try:
        encoded = raw.encode("utf-8")
        if len(encoded) > MAX_NOTEBOOK_BYTES:
            _fail("style_source_budget")
        value = json.loads(_json_text(encoded), object_pairs_hook=_json_object, parse_constant=_invalid_constant)
    except StyleSourceError:
        raise
    except (UnicodeError, ValueError, TypeError, RecursionError, NotebookPayloadError) as error:
        raise StyleSourceError("style_source_json") from error
    if not isinstance(value, dict):
        _fail("style_source_json")
    return value


def _raw(value):
    try:
        raw = canonical_json(value)
        if len(raw.encode("utf-8")) > MAX_NOTEBOOK_BYTES:
            _fail("style_source_budget")
        return raw
    except StyleSourceError:
        raise
    except (ValueError, TypeError, UnicodeError, RecursionError) as error:
        raise StyleSourceError("style_source_json") from error


def _snapshot(row):
    return None if row is None else tuple(sorted(dict(row).items()))


@dataclass(frozen=True)
class StyleSources:
    source_sha256: tuple[str, ...]
    markdowns: tuple[str, ...]

    @property
    def possible(self):
        # A necessary syntactic condition only. A hit is NEVER a style proof;
        # code/math/orphan examples still go through the real TS Markdown AST.
        return any(STYLE_PREFIX in value for value in self.markdowns)

    def wire(self):
        return {"source_sha256": list(self.source_sha256), "markdowns": list(self.markdowns)}


@dataclass(frozen=True)
class PrivateStyleCapture:
    account_id: str
    space_id: str
    document_type: str
    document_id: str
    note_id: str
    current: StyleSources
    proposed: StyleSources
    rows: tuple
    blobs: tuple


def _document_row(connection, account, space, kind, identity):
    return connection.execute(
        "SELECT * FROM sync_documents WHERE account_id=? AND space_id=? AND document_type=? AND document_id=?",
        (account, space, kind, identity),
    ).fetchone()


def _content(row):
    return None if row is None or row["deleted"] or row["content_json"] is None else _json(row["content_json"])


def _metadata_note_id(value):
    if not isinstance(value, dict):
        return None
    note = value.get("logicalId") if "notebookMetadataTransport" in value else value.get("id")
    return note if _identity(note) else None


def _known_graph(value):
    return isinstance(value, dict) and (value.get("notebookSchema") == 3 or value.get("notebookEnvelope") == 3)


def _decode_graph(connection, blob_dir, account, space, note_id, value, blobs):
    if value is None:
        return None, ()
    if not _known_graph(value) or value.get("noteId") != note_id:
        _fail("style_source_identity")
    body_hashes = ()
    document = value
    if value.get("notebookEnvelope") == 3:
        body_id, digest, size = value.get("body_id"), value.get("body_sha256"), value.get("body_size")
        references = value.get("blob_ids")
        if (not isinstance(body_id, str) or not SYNC_ID.fullmatch(body_id)
                or not isinstance(digest, str) or not SHA256.fullmatch(digest)
                or not _integer(size, 1, MAX_NOTEBOOK_BYTES)
                or not _integer(value.get("revision"), 0, MAX_SAFE_INTEGER)
                or not isinstance(references, list) or not 1 <= len(references) <= MAX_BLOB_REFERENCES
                or any(not isinstance(ref, str) or not SYNC_ID.fullmatch(ref) for ref in references)
                or len(set(references)) != len(references) or references[-1] != body_id):
            _fail("style_source_envelope")
        row = connection.execute(
            "SELECT * FROM sync_blobs WHERE id=? AND account_id=? AND space_id=?",
            (body_id, account, space),
        ).fetchone()
        if (row is None or row["media_type"] != "application/octet-stream"
                or not _integer(row["size"], 1, MAX_COMPRESSED_BYTES) or row["sha256"] != digest):
            _fail("style_source_body_unavailable")
        before = _snapshot(row)
        try:
            raw = _read_gzip(Path(blob_dir), row, digest, size)
            document = _json(raw.decode("utf-8", errors="strict"))
        except (NotebookPayloadError, UnicodeError, OSError) as error:
            raise StyleSourceError("style_source_body_unverified") from error
        after = connection.execute(
            "SELECT * FROM sync_blobs WHERE id=? AND account_id=? AND space_id=?",
            (body_id, account, space),
        ).fetchone()
        if _snapshot(after) != before:
            _fail("style_source_changed")
        previous = blobs.setdefault(body_id, before)
        if previous != before:
            _fail("style_source_changed")
        if document.get("blob_ids", []) != references[:-1] or document.get("revision") != value["revision"]:
            _fail("style_source_envelope")
        body_hashes = (hashlib.sha256(raw).hexdigest(),)
    # This is only a bounded source feature view, not full graph/Yjs validation.
    # No lineage is invented from a private request or used as an authority.
    if (document.get("notebookSchema") != 3 or document.get("noteId") != note_id
            or not _integer(document.get("revision"), 0, MAX_SAFE_INTEGER)
            or not isinstance(document.get("pages"), list) or not 1 <= len(document["pages"]) <= 2000
            or not isinstance(document.get("objects"), list) or len(document["objects"]) > 100000
            or not isinstance(document.get("assets"), list) or not isinstance(document.get("audio"), list)):
        _fail("style_source_graph")
    return document, body_hashes


def _group(connection, blob_dir, resource, values, raw_sources, blobs):
    graph, body_hashes = _decode_graph(connection, blob_dir, resource["owner_account_id"],
                                      resource["space_id"], resource["note_id"], values[0], blobs)
    markdowns = []
    if graph is not None:
        for item in graph["objects"]:
            if isinstance(item, dict) and item.get("kind") in ("text", "sticky"):
                markdown = item.get("markdown", "")
                if not isinstance(markdown, str):
                    _fail("style_source_graph")
                markdowns.append(markdown)
        # legacy.markdown, retained history and Yjs tombstones do not describe
        # active formatted passages: scanning them would prevent style removal.
    if values[1] is not None:
        note = project_metadata(resource, values[1])
        if note is None:
            _fail("style_source_metadata")
        markdown = note.get("markdown", "")
        if not isinstance(markdown, str):
            _fail("style_source_metadata")
        markdowns.append(markdown)
    if sum(len(text.encode("utf-8")) for text in markdowns) > MAX_NOTEBOOK_BYTES or len(markdowns) > 100001:
        _fail("style_source_budget")
    hashes = tuple(hashlib.sha256(raw.encode("utf-8")).hexdigest() for raw in raw_sources if raw is not None)
    return StyleSources(hashes + body_hashes, tuple(markdowns))


def capture_private_style_sources(connection, blob_dir, *, account_id, space_id,
                                  document_type, document_id, proposed_content):
    """Capture an already authenticated owner's exact current/proposed pair.

    The caller retains its existing managed/private policy and base-version CAS.
    Returning None means this is not an identified paper/notes source. It never
    means a marker hit was safe; actual style binding belongs to the TS worker.
    """
    if document_type not in ("whiteboard", "notesMarkdown"):
        return None
    if not all(isinstance(value, str) and SYNC_ID.fullmatch(value) for value in (account_id, space_id, document_id)):
        _fail("style_source_identity")
    target = _document_row(connection, account_id, space_id, document_type, document_id)
    current_value = _content(target)
    proposed_raw = _raw(proposed_content)
    proposed = _json(proposed_raw)
    if document_type == "whiteboard":
        identified = [value.get("noteId") for value in (current_value, proposed) if _known_graph(value)]
        if not identified:
            return None
        if any(not _identity(value) for value in identified) or len(set(identified)) != 1:
            _fail("style_source_identity")
        note_id = identified[0]
    else:
        identified = [value for source in (current_value, proposed) if (value := _metadata_note_id(source)) is not None]
        if not identified:
            # Unknown id2 transport cannot be inverted or silently paired.
            if document_id.startswith("note-meta-id2-"):
                _fail("style_source_identity")
            return None
        if len(set(identified)) != 1:
            _fail("style_source_identity")
        note_id = identified[0]
    try:
        canonical_id, metadata_id = canonical_document_id(note_id), metadata_document_id(note_id)
    except (ValueError, TypeError, UnicodeError) as error:
        raise StyleSourceError("style_source_identity") from error
    if document_id != (canonical_id if document_type == "whiteboard" else metadata_id):
        _fail("style_source_identity")
    resource = {"owner_account_id": account_id, "space_id": space_id, "note_id": note_id,
                "canonical_document_id": canonical_id, "metadata_document_id": metadata_id}
    keys = (("whiteboard", canonical_id), ("notesMarkdown", metadata_id))
    rows = [_document_row(connection, account_id, space_id, kind, identity) for kind, identity in keys]
    index = 0 if document_type == "whiteboard" else 1
    if _snapshot(rows[index]) != _snapshot(target):
        _fail("style_source_changed")
    current = [_content(row) for row in rows]
    after = list(current)
    after[index] = proposed
    raw_sources = [row["content_json"] if row is not None and not row["deleted"] else None for row in rows]
    proposed_sources = list(raw_sources)
    proposed_sources[index] = proposed_raw
    blobs = {}
    before_group = _group(connection, blob_dir, resource, current, raw_sources, blobs)
    after_group = _group(connection, blob_dir, resource, after, proposed_sources, blobs)
    return PrivateStyleCapture(account_id, space_id, document_type, document_id, note_id,
                               before_group, after_group,
                               tuple((key, _snapshot(row)) for key, row in zip(keys, rows)),
                               tuple(sorted(blobs.items())))


def private_style_capture_current(connection, blob_dir, capture, proposed_content):
    """Final exact re-read after the worker, before the caller's real mutation.

    A full recapture also rechecks actual gzip bytes, not only their DB header.
    Caller session/ACL/base-version checks still run independently.
    """
    return capture_private_style_sources(connection, blob_dir, account_id=capture.account_id,
                                         space_id=capture.space_id, document_type=capture.document_type,
                                         document_id=capture.document_id, proposed_content=proposed_content) == capture


def inspect_private_style_capture(worker, capture):
    """Return the exact current/proposed codec requirement, not writer rights.

    Absence of the necessary v1 prefix is conclusive for this v1 codec and
    avoids a Node process for ordinary unstyled notes. A hit always requires
    the real pinned AST worker; an unavailable/old worker fails closed.
    """
    if capture is None or not capture.current.possible and not capture.proposed.possible:
        return False, False
    if worker is None:
        _fail("style_inspector_unavailable")
    result = worker.inspect_text_styles(current=capture.current.wire(), proposed=capture.proposed.wire())
    return result.current_requires_style_v1, result.proposed_requires_style_v1


def require_private_style_writer(worker, capture, *, advertised_codec=None):
    """Compatibility decision only; this is NOT an existing HTTP capability.

    A future closed transport must supply this new exact declaration from its
    qualified N025 build. It grants no actor/ACL/session/write authority. None,
    malformed or unknown declarations cannot claim v1 support. The caller must
    still revalidate its real authority and exact capture before committing.
    """
    current, proposed = inspect_private_style_capture(worker, capture)
    if (current or proposed) and advertised_codec != STYLE_FEATURE:
        _fail("document_update_required")
    # In particular current=True/proposed=False is allowed for a capable writer:
    # explicit removal is not confused with an old editor's accidental downgrade.
    return current, proposed
