"""Pure v2 exact UTF-8 protocol. No authorization, DB, network or graph-validity claim.

Never replace source_json by canonical_json after checking its digest. The exact
strings are the future stored/replayed sources; actual TS/Yjs validation remains
mandatory in the publication service outside the write transaction.
"""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import math
import re
from uuid import UUID

from .notebook_payload import _json_text, _json_object, _invalid_constant, NotebookPayloadError

SOURCE_CODEC = "source-json-utf8-sha256@1"
WRITE_PROTOCOL = "dowze-managed-notebook-write@2"
MAX_SOURCE_BYTES = 16 * 1024 * 1024
MAX_PACKET_BYTES = 4 * MAX_SOURCE_BYTES + 65_536
MAX_NODES = 500_000
MAX_VERSION = 9_007_199_254_740_991
SHA256 = re.compile(r"^[a-f0-9]{64}$")


class ManagedWireError(ValueError):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def _fail(code="invalid_managed_json"):
    raise ManagedWireError(code)


def _bound(value, maximum):
    if type(value) is not int or not 2 <= value <= maximum:
        _fail("managed_json_budget")
    return value


def _text_bytes(text, maximum):
    if not isinstance(text, str):
        _fail()
    if len(text) > maximum:
        _fail("managed_json_budget")
    try:
        raw = text.encode("utf-8", errors="strict")
    except UnicodeError:
        _fail()
    if len(raw) > maximum:
        _fail("managed_json_budget")
    return raw


def _load(raw):
    try:
        result = json.loads(_json_text(raw), object_pairs_hook=_json_object, parse_constant=_invalid_constant)
        if not isinstance(result, dict):
            _fail()
        pending, nodes = [result], 0
        while pending:
            item = pending.pop()
            nodes += 1
            if nodes > MAX_NODES:
                _fail("managed_json_budget")
            if isinstance(item, dict):
                for key, value in item.items():
                    key.encode("utf-8", errors="strict")
                    pending.append(value)
            elif isinstance(item, list):
                pending.extend(item)
            elif isinstance(item, str):
                item.encode("utf-8", errors="strict")
            elif type(item) in (float, int):
                if not math.isfinite(item):
                    _fail()
        return result
    except ManagedWireError:
        raise
    except (NotebookPayloadError, ValueError, OverflowError, UnicodeError, RecursionError):
        _fail()


@dataclass(frozen=True)
class ManagedSource:
    source_json: str
    sha256: str
    size: int

    def load(self):
        """A fresh independent semantic view; the exact immutable wire stays intact."""
        return _load(self.source_json.encode("utf-8"))


def parse_source(source_json, sha256, *, max_bytes=MAX_SOURCE_BYTES):
    maximum = _bound(max_bytes, MAX_SOURCE_BYTES)
    raw = _text_bytes(source_json, maximum)
    if not isinstance(sha256, str) or not SHA256.fullmatch(sha256):
        _fail("invalid_managed_packet")
    _load(raw)
    actual = hashlib.sha256(raw).hexdigest()
    if actual != sha256:
        _fail("managed_hash_mismatch")
    return ManagedSource(source_json, actual, len(raw))


def _uuid(value):
    try:
        return isinstance(value, str) and str(UUID(value)) == value
    except (ValueError, AttributeError):
        return False


@dataclass(frozen=True)
class ManagedWritePacket:
    packet_json: str
    packet_sha256: str
    incarnation: str
    resource_version: int
    writer_version: int
    canonical_version: int
    metadata_version: int
    canonical: ManagedSource
    metadata: ManagedSource


def parse_write_packet(packet_json, *, max_source_bytes=MAX_SOURCE_BYTES, max_packet_bytes=MAX_PACKET_BYTES):
    maximum = _bound(max_packet_bytes, MAX_PACKET_BYTES)
    _bound(max_source_bytes, MAX_SOURCE_BYTES)
    raw = _text_bytes(packet_json, maximum)
    value = _load(raw)
    if set(value) != {"protocol", "source_codec", "incarnation", "resource_version", "writer_version", "canonical", "metadata"} or value["protocol"] != WRITE_PROTOCOL or value["source_codec"] != SOURCE_CODEC or not _uuid(value["incarnation"]):
        _fail("invalid_managed_packet")
    versions = [value["resource_version"], value["writer_version"]]
    sources = []
    for name in ("canonical", "metadata"):
        source = value[name]
        if not isinstance(source, dict) or set(source) != {"base_version", "source_json", "sha256"}:
            _fail("invalid_managed_packet")
        versions.append(source["base_version"])
        sources.append(parse_source(source["source_json"], source["sha256"], max_bytes=max_source_bytes))
    if any(type(version) is not int or not 1 <= version <= MAX_VERSION for version in versions):
        _fail("invalid_managed_packet")
    return ManagedWritePacket(packet_json, hashlib.sha256(raw).hexdigest(), value["incarnation"], *versions, *sources)
