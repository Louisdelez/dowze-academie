"""Fail-closed adapter for the pinned real TypeScript/Yjs validator.

Private Linux candidate only. Heap limit is not a claim about total RSS: Root's
outer cgroup remains the process-tree resource boundary. Nothing is executed
until a trusted startup explicitly supplies and pins both executable files.
"""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import selectors
import stat
import subprocess
import threading
import time

from .sync import canonical_json

PROTOCOL = "dowze-notebook-validation@1"
MAX_INPUT = 24 * 1024 * 1024
MAX_OUTPUT = 8192
MAX_STDERR = 4096
MAX_WORKER = 8 * 1024 * 1024
MAX_NODE = 160 * 1024 * 1024
REASONS = {"ok", "invalid_protocol", "invalid_notebook", "invalid_collaboration", "invalid_metadata", "invalid_json", "input_budget"}
STYLE_PROTOCOL = "dowze-notebook-text-style-inspection@1"
STYLE_REASONS = {"ok", "invalid_protocol", "invalid_style_sources", "invalid_json", "input_budget"}


class NotebookValidationError(Exception):
    def __init__(self, code, *, invalid=False):
        self.code, self.invalid = code, invalid
        super().__init__(code)


@dataclass(frozen=True)
class ValidatedNotebook:
    input_sha256: str
    canonical_sha256: str
    metadata_sha256: str


@dataclass(frozen=True)
class InspectedTextStyles:
    input_sha256: str
    current_requires_style_v1: bool
    proposed_requires_style_v1: bool


def _pin(path: Path, expected: str, maximum: int):
    if len(expected) != 64 or any(character not in "0123456789abcdef" for character in expected):
        raise NotebookValidationError("validator_configuration")
    flags = os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW | os.O_NONBLOCK
    descriptor = os.open(path, flags)
    try:
        before = os.fstat(descriptor)
        if not stat.S_ISREG(before.st_mode) or not 1 <= before.st_size <= maximum:
            raise NotebookValidationError("validator_configuration")
        digest = hashlib.sha256()
        remaining = before.st_size
        while remaining:
            part = os.read(descriptor, min(65536, remaining))
            if not part:
                raise NotebookValidationError("validator_configuration")
            digest.update(part)
            remaining -= len(part)
        after = os.fstat(descriptor)
        if (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) != (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns) or digest.hexdigest() != expected:
            raise NotebookValidationError("validator_configuration")
        os.lseek(descriptor, 0, os.SEEK_SET)
        return descriptor
    except BaseException:
        os.close(descriptor)
        raise


class NotebookValidationWorker:
    """One validator at a time; overload refuses instead of queuing unbounded work."""
    def __init__(self, node: Path, node_sha256: str, worker: Path, worker_sha256: str, *, timeout=20.0):
        if not 0 < timeout <= 30:
            raise ValueError("bounded validator timeout required")
        self.node, self.node_sha256 = Path(node), node_sha256
        self.worker, self.worker_sha256 = Path(worker), worker_sha256
        self.timeout = timeout
        self._slot = threading.BoundedSemaphore(1)
        self._children = set()
        self._lock = threading.Lock()

    @property
    def pending(self):
        with self._lock:
            return len(self._children)

    def validate(self, *, note_id, lineage, canonical, metadata):
        request = {"protocol": PROTOCOL, "note_id": note_id, "lineage": lineage, "canonical": canonical, "metadata": metadata}
        try:
            encoded = canonical_json(request).encode("utf-8")
        except (ValueError, TypeError, UnicodeError, RecursionError) as error:
            raise NotebookValidationError("invalid_payload", invalid=True) from error
        if len(encoded) > MAX_INPUT:
            raise NotebookValidationError("input_budget", invalid=True)
        if not self._slot.acquire(blocking=False):
            raise NotebookValidationError("validator_busy")
        try:
            output = self._execute(encoded)
        finally:
            # Failure to reap a killed child is fatal to this instance. Keep
            # admission closed instead of starting a second validator process.
            if self.pending == 0:
                self._slot.release()
        expected = hashlib.sha256(encoded).hexdigest()
        try:
            def unique(pairs):
                result = {}
                for key, item in pairs:
                    if key in result:
                        raise ValueError("duplicate validator field")
                    result[key] = item
                return result
            def finite(_value):
                raise ValueError("nonfinite validator field")
            value = json.loads(output.decode("utf-8"), object_pairs_hook=unique, parse_constant=finite)
        except (ValueError, UnicodeError) as error:
            raise NotebookValidationError("validator_protocol") from error
        if not isinstance(value, dict) or set(value) != {"protocol", "input_sha256", "valid", "reason"} or value["protocol"] != PROTOCOL or value["input_sha256"] != expected or type(value["valid"]) is not bool or value["reason"] not in REASONS or value["valid"] != (value["reason"] == "ok"):
            raise NotebookValidationError("validator_protocol")
        if not value["valid"]:
            raise NotebookValidationError(value["reason"], invalid=True)
        return ValidatedNotebook(expected, hashlib.sha256(canonical_json(canonical).encode("utf-8")).hexdigest(), hashlib.sha256(canonical_json(metadata).encode("utf-8")).hexdigest())

    def inspect_text_styles(self, *, current, proposed):
        """Separate closed inspection mode; existing validate@1 is unchanged.

        This is a source feature result, never client authentication or write
        authority. It shares the same slot, pinned executable and child ledger.
        """
        request = {"protocol": STYLE_PROTOCOL, "current": current, "proposed": proposed}
        try:
            encoded = canonical_json(request).encode("utf-8")
        except (ValueError, TypeError, UnicodeError, RecursionError) as error:
            raise NotebookValidationError("invalid_style_sources", invalid=True) from error
        if len(encoded) > MAX_INPUT:
            raise NotebookValidationError("input_budget", invalid=True)
        if not self._slot.acquire(blocking=False):
            raise NotebookValidationError("validator_busy")
        try:
            output = self._execute(encoded)
        finally:
            if self.pending == 0:
                self._slot.release()
        try:
            def unique(pairs):
                value = {}
                for key, item in pairs:
                    if key in value:
                        raise ValueError("duplicate inspection member")
                    value[key] = item
                return value
            def finite(_value):
                raise ValueError("nonfinite inspection member")
            result = json.loads(output.decode("utf-8"), object_pairs_hook=unique, parse_constant=finite)
        except (ValueError, UnicodeError) as error:
            raise NotebookValidationError("validator_protocol") from error
        expected = hashlib.sha256(encoded).hexdigest()
        if (not isinstance(result, dict)
                or set(result) != {"protocol", "input_sha256", "valid", "reason", "current_requires_style_v1", "proposed_requires_style_v1"}
                or result["protocol"] != STYLE_PROTOCOL or result["input_sha256"] != expected
                or type(result["valid"]) is not bool or not isinstance(result["reason"], str) or result["reason"] not in STYLE_REASONS
                or result["valid"] != (result["reason"] == "ok")
                or type(result["current_requires_style_v1"]) is not bool
                or type(result["proposed_requires_style_v1"]) is not bool
                or not result["valid"] and (result["current_requires_style_v1"] or result["proposed_requires_style_v1"])):
            raise NotebookValidationError("validator_protocol")
        if not result["valid"]:
            raise NotebookValidationError(result["reason"], invalid=True)
        return InspectedTextStyles(expected, result["current_requires_style_v1"], result["proposed_requires_style_v1"])

    def _execute(self, encoded):
        descriptors, process = [], None
        selector = selectors.DefaultSelector()
        try:
            if os.name != "posix" or not Path("/proc/self/fd").is_dir():
                raise NotebookValidationError("validator_platform")
            descriptors.append(_pin(self.node, self.node_sha256, MAX_NODE))
            descriptors.append(_pin(self.worker, self.worker_sha256, MAX_WORKER))
            # These exact verified file descriptions survive path replacement.
            process = subprocess.Popen([f"/proc/self/fd/{descriptors[0]}", "--max-old-space-size=256", "--no-addons", "--disable-proto=throw", "--experimental-default-type=module", f"/proc/self/fd/{descriptors[1]}"],
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                cwd="/", env={"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8", "TZ": "UTC"},
                close_fds=True, pass_fds=tuple(descriptors))
            with self._lock:
                self._children.add(process)
            for stream in (process.stdin, process.stdout, process.stderr):
                os.set_blocking(stream.fileno(), False)
            selector.register(process.stdin, selectors.EVENT_WRITE, "stdin")
            selector.register(process.stdout, selectors.EVENT_READ, "stdout")
            selector.register(process.stderr, selectors.EVENT_READ, "stderr")
            written, output, diagnostic = 0, bytearray(), bytearray()
            deadline = time.monotonic() + self.timeout
            while selector.get_map():
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise NotebookValidationError("validator_timeout")
                for event, _mask in selector.select(min(remaining, 0.1)):
                    stream, kind = event.fileobj, event.data
                    if kind == "stdin":
                        try:
                            written += os.write(stream.fileno(), encoded[written:written + 65536])
                        except BrokenPipeError as error:
                            raise NotebookValidationError("validator_process") from error
                        if written == len(encoded):
                            selector.unregister(stream)
                            stream.close()
                    else:
                        part = os.read(stream.fileno(), 65536)
                        if not part:
                            selector.unregister(stream)
                            stream.close()
                            continue
                        target, maximum = (output, MAX_OUTPUT) if kind == "stdout" else (diagnostic, MAX_STDERR)
                        if len(target) + len(part) > maximum:
                            raise NotebookValidationError("validator_output_budget")
                        target.extend(part)
            try:
                code = process.wait(timeout=max(0.001, deadline - time.monotonic()))
            except subprocess.TimeoutExpired as error:
                raise NotebookValidationError("validator_timeout") from error
            if code != 0 or diagnostic:
                raise NotebookValidationError("validator_process")
            return bytes(output)
        except NotebookValidationError:
            raise
        except (OSError, ValueError) as error:
            raise NotebookValidationError("validator_unavailable") from error
        finally:
            selector.close()
            try:
                if process is not None:
                    # Never release the slot while the owned child is alive.
                    try:
                        if process.poll() is None:
                            process.kill()
                        process.wait(timeout=5)
                    finally:
                        for stream in (process.stdin, process.stdout, process.stderr):
                            if stream and not stream.closed:
                                stream.close()
                        if process.poll() is not None:
                            with self._lock:
                                self._children.discard(process)
            finally:
                for descriptor in descriptors:
                    os.close(descriptor)
