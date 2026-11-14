"""Read-only projection of the already shipped metadata-v1 envelope.

Raw stored_json/source hashes/history remain independent and unchanged. No
transport ID is allocated, renamed or inferred from an unbound nested note.
"""
import hashlib
import re


def _digest(value):
    return hashlib.sha256(b"Dowze/notebook-document/id2\0" + value.encode("utf-16-be", errors="strict")).hexdigest()


def metadata_document_id(note_id):
    if not isinstance(note_id, str) or not note_id or len(note_id.encode("utf-16-be", errors="strict")) // 2 > 200:
        raise ValueError("metadata identity")
    if re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,126}", note_id) and ".." not in note_id and not note_id.startswith("note-meta-id2-"):
        return note_id
    return "note-meta-id2-" + _digest("Dowze/metadata-transport/id2\0" + note_id)


def canonical_document_id(note_id):
    if note_id == "legacy-whiteboard-main":
        return "paper-v3-whiteboard-main"
    if re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,104}", note_id) and ".." not in note_id and not re.fullmatch(r"[a-f0-9]{32}", note_id):
        return "paper-v3-" + ("note-" + note_id)[:110]
    return "paper-v3-id2-" + _digest(note_id)


def project_metadata(resource, source):
    if not isinstance(source, dict):
        return None
    note_id = resource["note_id"]
    if "notebookMetadataTransport" not in source:
        return source if source.get("id") == note_id else None
    try:
        wire_id = metadata_document_id(note_id)
        valid = (wire_id != note_id and resource["metadata_document_id"] == wire_id
                 and resource["canonical_document_id"] == canonical_document_id(note_id)
                 and type(source.get("notebookMetadataTransport")) is int and source["notebookMetadataTransport"] == 1
                 and source.get("accountId") == resource["owner_account_id"] and source.get("spaceId") == resource["space_id"]
                 and source.get("logicalId") == note_id and source.get("documentId") == wire_id
                 and source.get("graphId") == resource["canonical_document_id"]
                 and isinstance(source.get("note"), dict) and source["note"].get("id") == note_id
                 and ("id" not in source or source["id"] == note_id))
    except (ValueError, UnicodeError, TypeError):
        return None
    return source["note"] if valid else None
