from __future__ import annotations

import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import tempfile
from datetime import datetime, timezone
import zipfile

from .db import Database

FORMATION_ID = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$")
VERSION = re.compile(r"^[0-9]+\.[0-9]+\.[0-9]+$")
REQUIRED_FILES = {
    "formation.json",
    "matieres.json",
    "programme.json",
    "planning.json",
    "evaluations.json",
    "taches.json",
}
MAX_PACKAGE_BYTES = 50 * 1024 * 1024
MAX_JSON_BYTES = 2 * 1024 * 1024
MAX_JSON_TOTAL = 8 * 1024 * 1024
MAX_MEMBERS = 32


class PackageValidationError(ValueError):
    pass


def _sha256(body: bytes) -> str:
    return hashlib.sha256(body).hexdigest()


def _validate_member(info: zipfile.ZipInfo) -> str:
    name = info.filename
    path = PurePosixPath(name)
    mode = info.external_attr >> 16
    if (
        not name
        or not path.parts
        or "\\" in name
        or path.is_absolute()
        or ".." in path.parts
        or (path.parts and ":" in path.parts[0])
        or stat.S_ISLNK(mode)
        or info.is_dir()
    ):
        raise PackageValidationError("unsafe package member")
    if len(name) > 255 or len(path.parts) != 1:
        raise PackageValidationError("unsafe package member")
    return name


def publish_package(
    db: Database,
    package_dir: Path,
    source: Path,
    formation_id: str,
    version: str,
    title: str,
    *, validation_report: dict | None = None,
) -> dict:
    if not FORMATION_ID.fullmatch(formation_id) or not VERSION.fullmatch(version):
        raise PackageValidationError("invalid package identifier")
    if not title or len(title) > 200:
        raise PackageValidationError("invalid title")
    source = Path(source)
    try:
        with source.open("rb") as input_file:
            package_bytes = input_file.read(MAX_PACKAGE_BYTES + 1)
    except OSError as error:
        raise PackageValidationError("invalid ZIP package") from error
    package_size = len(package_bytes)
    if package_size <= 0 or package_size > MAX_PACKAGE_BYTES:
        raise PackageValidationError("invalid package size")
    files: list[dict] = []
    names: set[str] = set()
    json_total = 0
    try:
        with zipfile.ZipFile(io.BytesIO(package_bytes)) as archive:
            infos = archive.infolist()
            if len(infos) > MAX_MEMBERS:
                raise PackageValidationError("too many package members")
            for info in infos:
                name = _validate_member(info)
                if name in names:
                    raise PackageValidationError("duplicate package member")
                names.add(name)
                if info.file_size > MAX_JSON_BYTES:
                    raise PackageValidationError("package member too large")
                body = archive.read(info)
                if len(body) != info.file_size:
                    raise PackageValidationError("package member size mismatch")
                if name.endswith(".json"):
                    json_total += len(body)
                    try:
                        parsed = json.loads(body)
                    except (UnicodeDecodeError, json.JSONDecodeError) as error:
                        raise PackageValidationError("invalid JSON member") from error
                    if name == "formation.json" and (
                        not isinstance(parsed, dict) or parsed.get("id") != formation_id
                    ):
                        raise PackageValidationError("formation identity mismatch")
                files.append({"path": name, "size": len(body), "sha256": _sha256(body)})
    except (zipfile.BadZipFile, OSError, RuntimeError, NotImplementedError) as error:
        raise PackageValidationError("invalid ZIP package") from error
    json_names = {name for name in names if name.endswith(".json")}
    if json_names != REQUIRED_FILES or json_total > MAX_JSON_TOTAL:
        raise PackageValidationError("incomplete or oversized formation package")

    if validation_report is not None:
        expected = {item["path"]: item["sha256"] for item in files if item["path"] in REQUIRED_FILES}
        if (not isinstance(validation_report, dict) or validation_report.get("valid") is not True
            or validation_report.get("formationId") != formation_id
            or validation_report.get("packageVersion") != version
            or validation_report.get("sha256") != expected):
            raise PackageValidationError("semantic validation report does not match package bytes")

    package_dir = Path(package_dir)
    package_dir.mkdir(parents=True, exist_ok=True)
    destination = package_dir / f"{formation_id}-{version}-{_sha256(package_bytes)}.zip"
    fd, temporary_name = tempfile.mkstemp(prefix=".publish-", suffix=".tmp", dir=package_dir)
    temporary = Path(temporary_name)
    created_destination = False
    try:
        with os.fdopen(fd, "wb") as output:
            output.write(package_bytes)
            output.flush()
            os.fsync(output.fileno())
        manifest = {
            "formation_id": formation_id,
            "version": version,
            "title": title,
            "package_size": package_size,
            "package_sha256": _sha256(package_bytes),
            "files": sorted(files, key=lambda item: item["path"]),
        }
        try:
            with db.transaction() as connection:
                if connection.execute(
                    "SELECT 1 FROM catalog_packages WHERE formation_id = ? AND version = ?",
                    (formation_id, version),
                ).fetchone():
                    raise PackageValidationError("package version already published")
                if destination.exists():
                    if destination.is_symlink() or _sha256(destination.read_bytes()) != manifest["package_sha256"]:
                        raise PackageValidationError("package storage collision")
                else:
                    try:
                        os.link(temporary, destination)
                        created_destination = True
                    except FileExistsError:
                        if destination.is_symlink() or _sha256(destination.read_bytes()) != manifest["package_sha256"]:
                            raise PackageValidationError("package storage collision")
                connection.execute(
                    "INSERT INTO catalog_packages "
                    "(formation_id, version, title, package_size, package_sha256, manifest_json, stored_path, published_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        formation_id,
                        version,
                        title,
                        package_size,
                        manifest["package_sha256"],
                        json.dumps(manifest, separators=(",", ":"), sort_keys=True),
                        destination.name,
                        datetime.now(timezone.utc).isoformat(),
                    ),
                )
        except BaseException:
            if created_destination:
                destination.unlink(missing_ok=True)
            raise
        return manifest
    finally:
        temporary.unlink(missing_ok=True)
