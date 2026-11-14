"""Bounded read-only decoding of the existing paperSync.ts gzip envelope.

The caller must authenticate and authorize the resource under its existing DB
transaction first. Owner/space come from that registered resource, never from a
recipient-controlled URL. This codec proves source bytes and identity; it is not
a port of the full TypeScript isPaperDocument/geometry/study validator and must
not be used as sufficient validation for a new shared document mutation.
"""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import zlib

MAX_NOTEBOOK_BYTES = 16 * 1024 * 1024
MAX_COMPRESSED_BYTES = 16 * 1024 * 1024
MAX_BLOB_REFERENCES = 1_000
CHUNK_BYTES = 64 * 1024
MAX_DECODE_STEPS = 2_048
MAX_JSON_DEPTH = 256
# Deflate's expansion is below this generous ceiling. The absolute output and
# step limits remain authoritative, including very compressible legitimate ink.
MAX_EXPANSION_RATIO = 2_048
MAX_SAFE_INTEGER = 9_007_199_254_740_991
SHA256 = re.compile(r"^[a-f0-9]{64}$")
STORED_NAME = re.compile(r"^[a-f0-9]{64}\.blob$")
SYNC_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")


class NotebookPayloadError(ValueError):
    def __init__(self, code, message):
        self.code, self.message = code, message
        super().__init__(code)


def _fail(code="invalid_notebook_body", message="Notebook source could not be verified"):
    raise NotebookPayloadError(code, message)


def _integer(value, low, high):
    return isinstance(value, int) and not isinstance(value, bool) and low <= value <= high


def _identity(value):
    if not isinstance(value, str) or not value:
        return False
    try:
        return len(value.encode("utf-16-be")) // 2 <= 200
    except UnicodeError:
        return False


def _bound_document(value, note_id, lineage, revision=None):
    collaboration = value.get("collaboration") if isinstance(value, dict) else None
    if not isinstance(value, dict) or value.get("notebookSchema") != 3 or value.get("noteId") != note_id or not _identity(value.get("noteId")) or not _integer(value.get("revision"), 0, MAX_SAFE_INTEGER):
        _fail("notebook_identity_mismatch", "Notebook identity does not match its source")
    if revision is not None and value["revision"] != revision:
        _fail("notebook_identity_mismatch", "Notebook revision does not match its envelope")
    if not isinstance(collaboration, dict) or collaboration.get("schema") != 1 or collaboration.get("lineage") != lineage or not _identity(lineage) or not isinstance(collaboration.get("state"), str):
        _fail("notebook_identity_mismatch", "Notebook incarnation does not match its source")
    # Root shape limits protect the read path. Optional fields and every graph
    # value are retained verbatim; semantic graph validation is a later adapter.
    if not isinstance(value.get("pages"), list) or not 1 <= len(value["pages"]) <= 2_000 or not isinstance(value.get("objects"), list) or len(value["objects"]) > 100_000 or not isinstance(value.get("assets"), list) or not isinstance(value.get("audio"), list):
        _fail("invalid_notebook_shape", "Notebook root shape is incompatible")
    return value


def _json_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            _fail("invalid_notebook_json", "Duplicate JSON members are not accepted")
        result[key] = value
    return result


def _invalid_constant(_value):
    _fail("invalid_notebook_json", "Non-finite JSON constants are not accepted")


def _json_text(raw):
    """Bound syntax nesting independently of the interpreter recursion limit.

    String contents are opaque, including escaped backslashes and quotes. The
    standard parser still validates JSON grammar and duplicate keys afterwards.
    """
    text = raw.decode("utf-8", errors="strict")
    depth, quoted, escaped = 0, False, False
    for character in text:
        if quoted:
            if escaped:
                escaped = False
            elif character == "\\":
                escaped = True
            elif character == '"':
                quoted = False
        elif character == '"':
            quoted = True
        elif character in "[{":
            depth += 1
            if depth > MAX_JSON_DEPTH:
                _fail("invalid_notebook_json", "Notebook JSON exceeds its nesting budget")
        elif character in "]}":
            depth -= 1
            if depth < 0:
                _fail("invalid_notebook_json", "Notebook JSON nesting is invalid")
    if quoted or depth:
        _fail("invalid_notebook_json", "Notebook JSON is incomplete")
    return text


@dataclass(frozen=True)
class NotebookPayloadPolicy:
    blob_dir: Path
    max_blob_bytes: int = MAX_COMPRESSED_BYTES


@dataclass(frozen=True)
class DecodedNotebook:
    document: dict
    body_id: str | None
    compressed_size: int
    uncompressed_size: int
    compressed_sha256: str | None


def _read_gzip(blob_dir, row, expected_sha256, expected_size):
    """Open only a verified owner DB record, not an arbitrary filesystem path."""
    name = row["stored_name"]
    if not isinstance(name, str) or not STORED_NAME.fullmatch(name):
        _fail("notebook_body_unavailable")
    root_descriptor = file_descriptor = None
    try:
        if not all(hasattr(os, flag) for flag in ("O_NOFOLLOW", "O_DIRECTORY", "O_CLOEXEC", "O_NONBLOCK")):
            _fail("notebook_body_unavailable", "Secure local blob reads are unavailable")
        root_descriptor = os.open(Path(blob_dir), os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
        file_descriptor = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NONBLOCK, dir_fd=root_descriptor)
        before = os.fstat(file_descriptor)
        if not stat.S_ISREG(before.st_mode) or before.st_size != row["size"]:
            _fail("notebook_body_unavailable")
        decoder, digest = zlib.decompressobj(16 + zlib.MAX_WBITS), hashlib.sha256()
        chunks, total_input, total_output, steps = [], 0, 0, 0
        with os.fdopen(file_descriptor, "rb") as stream:
            file_descriptor = None  # stream now owns the descriptor on all exits
            while True:
                chunk = stream.read(min(CHUNK_BYTES, row["size"] - total_input + 1))
                if not chunk:
                    break
                total_input += len(chunk)
                if total_input > row["size"]:
                    _fail("notebook_body_unavailable")
                digest.update(chunk)
                pending = chunk
                while pending:
                    steps += 1
                    if steps > MAX_DECODE_STEPS:
                        _fail("notebook_body_budget", "Notebook decoding exceeded its work budget")
                    decoded = decoder.decompress(pending, min(CHUNK_BYTES, expected_size - total_output + 1))
                    total_output += len(decoded)
                    if total_output > expected_size or total_output > MAX_NOTEBOOK_BYTES:
                        _fail("notebook_body_size", "Notebook body exceeds its declared size")
                    if total_output > CHUNK_BYTES + total_input * MAX_EXPANSION_RATIO:
                        _fail("notebook_body_budget", "Notebook compression ratio is incompatible")
                    if decoder.unused_data:
                        _fail("invalid_notebook_body", "Trailing or concatenated gzip streams are not accepted")
                    if decoded:
                        chunks.append(decoded)
                    remainder = decoder.unconsumed_tail
                    if remainder and len(remainder) == len(pending) and not decoded:
                        _fail("invalid_notebook_body", "Notebook decoding made no progress")
                    pending = remainder
            after = os.fstat(stream.fileno())
        if total_input != row["size"] or before.st_size != after.st_size or before.st_mtime_ns != after.st_mtime_ns or not decoder.eof or decoder.unused_data or decoder.unconsumed_tail:
            _fail("notebook_body_unavailable")
        if digest.hexdigest() != expected_sha256 or digest.hexdigest() != row["sha256"]:
            _fail("notebook_body_hash", "Notebook body SHA-256 does not match")
        if total_output != expected_size:
            _fail("notebook_body_size", "Notebook body size does not match")
        return b"".join(chunks)
    except (OSError, zlib.error, OverflowError, TypeError, ValueError) as error:
        if isinstance(error, NotebookPayloadError):
            raise
        raise NotebookPayloadError("notebook_body_unavailable", "Notebook source could not be read safely") from error
    finally:
        if file_descriptor is not None:
            os.close(file_descriptor)
        if root_descriptor is not None:
            os.close(root_descriptor)


def decode_notebook_source(connection, blob_dir, *, owner_account_id, space_id, content, expected_note_id, expected_lineage, max_blob_bytes=MAX_COMPRESSED_BYTES):
    """Read within the caller's existing authorized transaction; never writes."""
    if not isinstance(content, dict):
        _fail("invalid_notebook_shape")
    if content.get("notebookEnvelope") != 3:
        return DecodedNotebook(_bound_document(content, expected_note_id, expected_lineage), None, 0, 0, None)
    body_id, digest, size = content.get("body_id"), content.get("body_sha256"), content.get("body_size")
    references = content.get("blob_ids")
    if not isinstance(body_id, str) or not SYNC_ID.fullmatch(body_id) or not isinstance(digest, str) or not SHA256.fullmatch(digest) or not _integer(size, 1, MAX_NOTEBOOK_BYTES) or not _integer(content.get("revision"), 0, MAX_SAFE_INTEGER) or content.get("noteId") != expected_note_id:
        _fail()
    if not isinstance(references, list) or not 1 <= len(references) <= MAX_BLOB_REFERENCES or any(not isinstance(value, str) or not SYNC_ID.fullmatch(value) for value in references) or len(set(references)) != len(references) or references[-1] != body_id:
        _fail("invalid_notebook_references", "Notebook body is not its exact final blob reference")
    row = connection.execute("SELECT stored_name,media_type,size,sha256 FROM sync_blobs WHERE id=? AND account_id=? AND space_id=?", (body_id, owner_account_id, space_id)).fetchone()
    if row is None or row["media_type"] != "application/octet-stream" or not _integer(row["size"], 1, min(max_blob_bytes, MAX_COMPRESSED_BYTES)) or row["sha256"] != digest:
        _fail("notebook_body_unavailable", "Notebook body is unavailable in its owner scope")
    raw = _read_gzip(blob_dir, row, digest, size)
    try:
        document = json.loads(_json_text(raw), object_pairs_hook=_json_object, parse_constant=_invalid_constant)
    except (UnicodeError, json.JSONDecodeError, RecursionError) as error:
        raise NotebookPayloadError("invalid_notebook_json", "Notebook body is not bounded UTF-8 JSON") from error
    _bound_document(document, expected_note_id, expected_lineage, content["revision"])
    # encodePaperSync appends exactly its body ID to the original reference list.
    # Undefined blob_ids is distinct from [], and neither source is rewritten.
    source_refs = document.get("blob_ids", [])
    if not isinstance(source_refs, list) or source_refs != references[:-1]:
        _fail("invalid_notebook_references", "Envelope media references do not match the decoded source")
    return DecodedNotebook(document, body_id, row["size"], size, digest)
