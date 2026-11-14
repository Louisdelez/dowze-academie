"""Fixed, image-sealed ASGI factories; never an environment-supplied command.

The release builder is source-only. Root must qualify the selected Node payload
inside the exact candidate image before deployment. Startup repeats the real
positive/negative validation before importing main (which opens the database).
"""
from __future__ import annotations

import copy
import hashlib
import importlib
import json
import os
from pathlib import Path
import re
import stat

APP_ROOT = Path("/srv/dowze/app/app")
RUNTIME_ROOT = Path("/opt/dowze/notebook-validator")
BASE_IMAGE = "sha256:40aff48d9922a36f38024f351a55e8a1c0415819ea21bf5f020a19f07b6f695e"
NODE_VERSION = "22.23.2"
PROTOCOL = "dowze-notebook-validation@1"
HASH = re.compile(r"[0-9a-f]{64}\Z")
SOURCE_NAME = re.compile(r"[A-Za-z_][A-Za-z_0-9]*\.py\Z")
REQUIRED_ROUTES = frozenset({
    ("GET", "/v1/notebooks/capabilities"),
    ("GET", "/v1/notebook-admission-proofs"),
    ("PUT", "/v1/notebooks/{resource_id}/admission"),
    ("GET", "/v1/notebooks/{resource_id}/state"),
    ("PUT", "/v1/notebooks/{resource_id}/state-v2"),
    ("POST", "/v1/notebooks/{resource_id}/trash"),
    ("POST", "/v1/notebooks/{resource_id}/restore"),
    ("GET", "/v1/notebooks/{resource_id}/lifecycle"),
    ("PUT", "/v1/spaces/{space_id}/documents/{document_type}/{document_id}"),
})


class NotebookStartupError(RuntimeError):
    """Contains only a stable public error code, never configuration/secrets."""


def _fail():
    raise NotebookStartupError("managed_notebook_startup_unavailable")


def _digest(value):
    return isinstance(value, str) and HASH.fullmatch(value) is not None


def _read_only_mount(path):
    # The inherited API user is root for its existing data-volume ownership.
    # chmod alone therefore is insufficient. Runtime code/payload mounts MUST
    # be read-only; deploy with cap-drop ALL/no-new-privileges as documented.
    if not os.statvfs(path).f_flag & os.ST_RDONLY:
        _fail()


def _owned_parents(path):
    # Image code is immutable to the runtime account, including all ancestors.
    # A symlink in a parent is not made safe by O_NOFOLLOW on the final file.
    for parent in (path.parent, *path.parent.parents):
        info = parent.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
            _fail()


def _read(path, maximum, *, expected=None, expected_size=None, capture=True, executable=False, allow_empty=False):
    _owned_parents(path)
    descriptor = os.open(path, os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(descriptor)
        if not stat.S_ISREG(before.st_mode) or before.st_uid != 0 or before.st_mode & 0o022 or not (0 if allow_empty else 1) <= before.st_size <= maximum:
            _fail()
        if executable and before.st_mode & 0o111 == 0:
            _fail()
        if expected_size is not None and before.st_size != expected_size:
            _fail()
        checksum, parts, remaining = hashlib.sha256(), [], before.st_size
        while remaining:
            part = os.read(descriptor, min(65536, remaining))
            if not part:
                _fail()
            checksum.update(part)
            if capture:
                parts.append(part)
            remaining -= len(part)
        after = os.fstat(descriptor)
        fields = ("st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns", "st_mode", "st_uid")
        if any(getattr(before, field) != getattr(after, field) for field in fields):
            _fail()
        actual = checksum.hexdigest()
        if expected is not None and (not _digest(expected) or actual != expected):
            _fail()
        return (b"".join(parts) if capture else b""), actual
    finally:
        os.close(descriptor)


def _json(raw):
    def unique(pairs):
        value = {}
        for key, item in pairs:
            if key in value:
                _fail()
            value[key] = item
        return value
    def finite(_value):
        _fail()
    return json.loads(raw.decode("utf-8"), object_pairs_hook=unique, parse_constant=finite)


def _artifact(value, maximum):
    if not isinstance(value, dict) or set(value) != {"sha256", "bytes"} or not _digest(value["sha256"]) or type(value["bytes"]) is not int or not 0 < value["bytes"] <= maximum:
        _fail()


def _release(*, runtime):
    _read_only_mount(APP_ROOT)
    _read_only_mount(RUNTIME_ROOT)
    pin, _checksum = _read(APP_ROOT / "notebook_release.sha256", 65)
    expected = pin.decode("ascii").strip()
    if not _digest(expected):
        _fail()
    raw, checksum = _read(RUNTIME_ROOT / "release.json", 1024 * 1024, expected=expected)
    release = _json(raw)
    if not isinstance(release, dict) or set(release) != {"schema", "kind", "base_image", "node", "worker", "fixture", "app", "build_manifest_sha256", "server_tree_sha256"}:
        _fail()
    if type(release["schema"]) is not int or release["schema"] != 1 or release["kind"] != "dowze-managed-server-release@1" or release["base_image"] != BASE_IMAGE or not _digest(release["build_manifest_sha256"]) or not _digest(release["server_tree_sha256"]):
        _fail()
    node = release["node"]
    if not isinstance(node, dict) or set(node) != {"version", "sha256", "bytes"} or node["version"] != NODE_VERSION:
        _fail()
    _artifact({key: node[key] for key in ("sha256", "bytes")}, 160 * 1024 * 1024)
    _artifact(release["worker"], 8 * 1024 * 1024)
    _artifact(release["fixture"], 24 * 1024 * 1024)
    sources = release["app"]
    if not isinstance(sources, dict) or not sources or "notebook_startup.py" not in sources or "__init__.py" not in sources:
        _fail()
    # Refuse an unsealed .py and any subpackage/symlink: the actual application
    # closure is flat. No extra application module can escape the source seal.
    present = set()
    for path in APP_ROOT.iterdir():
        if path.is_symlink() or path.is_dir():
            _fail()
        if path.suffix == ".py":
            present.add(path.name)
        elif path.suffix in {".pyc", ".pyo", ".so"}:
            _fail()
    if present != set(sources):
        _fail()
    for name, expected_source in sources.items():
        if not SOURCE_NAME.fullmatch(name) or not _digest(expected_source):
            _fail()
        _read(APP_ROOT / name, 4 * 1024 * 1024, expected=expected_source, capture=False, allow_empty=True)
    if runtime:
        _read(RUNTIME_ROOT / "node", 160 * 1024 * 1024, expected=node["sha256"], expected_size=node["bytes"], capture=False, executable=True)
        for name, key, cap in (("worker.mjs", "worker", 8 * 1024 * 1024), ("fixture.json", "fixture", 24 * 1024 * 1024)):
            entry = release[key]
            _read(RUNTIME_ROOT / name, cap, expected=entry["sha256"], expected_size=entry["bytes"], capture=False)
    return release, checksum


def _validated_runtime(release):
    # These imports do not import main or open a database.
    from .notebook_validation import NotebookValidationError, NotebookValidationWorker
    from .sync import canonical_json
    fixture, _checksum = _read(RUNTIME_ROOT / "fixture.json", 24 * 1024 * 1024, expected=release["fixture"]["sha256"], expected_size=release["fixture"]["bytes"])
    value = _json(fixture)
    if not isinstance(value, dict) or set(value) != {"protocol", "note_id", "lineage", "canonical", "metadata"} or value["protocol"] != PROTOCOL or not isinstance(value["note_id"], str) or not value["note_id"] or not isinstance(value["metadata"], dict):
        _fail()
    worker = NotebookValidationWorker(RUNTIME_ROOT / "node", release["node"]["sha256"], RUNTIME_ROOT / "worker.mjs", release["worker"]["sha256"], timeout=20.0)
    request = {key: value[key] for key in ("note_id", "lineage", "canonical", "metadata")}
    proof = worker.validate(**request)
    expected_input = hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()
    canonical_sha = hashlib.sha256(canonical_json(value["canonical"]).encode("utf-8")).hexdigest()
    metadata_sha = hashlib.sha256(canonical_json(value["metadata"]).encode("utf-8")).hexdigest()
    if worker.pending != 0 or (proof.input_sha256, proof.canonical_sha256, proof.metadata_sha256) != (expected_input, canonical_sha, metadata_sha):
        _fail()
    negative = copy.deepcopy(request)
    negative["metadata"]["id"] = value["note_id"] + "-startup-invalid"
    try:
        worker.validate(**negative)
    except NotebookValidationError as error:
        if not error.invalid or error.code != "invalid_metadata" or worker.pending != 0:
            _fail()
    else:
        _fail()
    return worker


def verify_runtime():
    """For an isolated, network-less real candidate-container smoke only."""
    try:
        release, checksum = _release(runtime=True)
        worker = _validated_runtime(release)
        return {"schema": 1, "release_sha256": checksum, "node_version": NODE_VERSION, "node_sha256": release["node"]["sha256"], "worker_sha256": release["worker"]["sha256"], "positive": True, "negative": True, "pending": worker.pending}
    except Exception:
        raise NotebookStartupError("managed_notebook_startup_unavailable") from None


def _application(release_sha):
    from .config import Settings
    settings = Settings.from_env()
    # No silent SQLite initialization if a deployment secret/config is missing.
    if settings.environment != "production" or not settings.database_url or not settings.database_url.startswith(("postgres://", "postgresql://")):
        _fail()
    application = importlib.import_module(".main", __package__).app
    if application.state.settings != settings or getattr(application.state, "notebook_validation_worker", None) is not None:
        _fail()
    actual = {(method, route.path) for route in application.routes if hasattr(route, "path") for method in (getattr(route, "methods", None) or ())}
    if not REQUIRED_ROUTES <= actual:
        _fail()
    application.state.notebook_release_sha256 = release_sha
    return application


def create_managed_app():
    """The only managed production entrypoint; use Uvicorn --factory/1 worker."""
    try:
        release, checksum = _release(runtime=True)
        worker = _validated_runtime(release)
        application = _application(checksum)
        from .notebook_write_routes import configure_notebook_writer
        configure_notebook_writer(application, worker)
        if application.state.notebook_validation_worker is not worker or worker.pending != 0:
            _fail()
        application.state.notebook_runtime_mode = "managed"
        return application
    except Exception:
        raise NotebookStartupError("managed_notebook_startup_unavailable") from None


def create_fenced_app():
    """Rollback on the SAME managed-aware sources/schema; no old private image.

    Reads and ordinary unbound private writes keep their existing ACL/fences.
    Managed mutations are unavailable, never rerouted through private v1.
    This factory deliberately neither reads nor executes the Node payload.
    """
    try:
        _release_value, checksum = _release(runtime=False)
        application = _application(checksum)
        from fastapi.responses import JSONResponse
        @application.middleware("http")
        async def fence_mutations(request, call_next):
            path = request.url.path
            if request.method in {"POST", "PUT", "PATCH", "DELETE"} and (path.startswith("/v1/notebooks/") or path.startswith("/v1/notebook-invitations")):
                return JSONResponse({"error": "managed_notebook_temporarily_unavailable"}, status_code=503)
            return await call_next(request)
        application.state.notebook_runtime_mode = "fenced"
        return application
    except Exception:
        raise NotebookStartupError("managed_notebook_startup_unavailable") from None
