from __future__ import annotations

import hashlib
import json
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import zipfile

import pytest

from app.catalog import PackageValidationError, publish_package
from app.config import Settings
from app.db import Database
from app.main import create_app
from fastapi.testclient import TestClient

REQUIRED = (
    "formation.json",
    "matieres.json",
    "programme.json",
    "planning.json",
    "evaluations.json",
    "taches.json",
)


def settings_for(tmp_path):
    return Settings(
        environment="test",
        database_path=tmp_path / "api.sqlite3",
        package_dir=tmp_path / "packages",
        allowed_origins=("http://127.0.0.1:4173",),
        session_ttl_seconds=3600,
        request_limit_per_minute=100,
    )


def make_zip(path: Path, *, traversal: bool = False, formation_id: str = "synthetic-course"):
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
        for name in REQUIRED:
            payload = {"id": formation_id} if name == "formation.json" else {}
            archive.writestr(name, json.dumps(payload, sort_keys=True))
        if traversal:
            archive.writestr("../escape.json", "{}")


def test_publish_rejects_traversal_without_partial_catalog_entry(tmp_path):
    settings = settings_for(tmp_path)
    db = Database(settings.database_path)
    db.initialize()
    source = tmp_path / "bad.zip"
    make_zip(source, traversal=True)

    with pytest.raises(PackageValidationError, match="unsafe package member"):
        publish_package(db, settings.package_dir, source, "synthetic-course", "1.0.0", "Synthetic")

    assert db.list_catalog() == []
    assert not list(settings.package_dir.glob("*.zip")) if settings.package_dir.exists() else True


def test_publish_rejects_a_manifest_identity_mismatch(tmp_path):
    settings = settings_for(tmp_path)
    db = Database(settings.database_path)
    db.initialize()
    source = tmp_path / "mismatch.zip"
    make_zip(source, formation_id="different-course")

    with pytest.raises(PackageValidationError, match="formation identity mismatch"):
        publish_package(db, settings.package_dir, source, "synthetic-course", "1.0.0", "Synthetic")

    assert db.list_catalog() == []


def test_publish_rejects_degenerate_member_name(tmp_path):
    settings = settings_for(tmp_path)
    db = Database(settings.database_path)
    db.initialize()
    source = tmp_path / "dot.zip"
    make_zip(source)
    with zipfile.ZipFile(source, "a") as archive:
        archive.writestr(".", "invalid")

    with pytest.raises(PackageValidationError, match="unsafe package member"):
        publish_package(db, settings.package_dir, source, "synthetic-course", "1.0.0", "Synthetic")


def test_manifest_sizes_hashes_and_download_match_validated_package(tmp_path):
    settings = settings_for(tmp_path)
    db = Database(settings.database_path)
    db.initialize()
    source = tmp_path / "valid.zip"
    make_zip(source)
    manifest = publish_package(
        db, settings.package_dir, source, "synthetic-course", "1.0.0", "Synthetic",
    )

    raw = source.read_bytes()
    assert manifest["package_size"] == len(raw)
    assert manifest["package_sha256"] == hashlib.sha256(raw).hexdigest()
    assert {item["path"] for item in manifest["files"]} == set(REQUIRED)
    with zipfile.ZipFile(source) as archive:
        for item in manifest["files"]:
            body = archive.read(item["path"])
            assert item["size"] == len(body)
            assert item["sha256"] == hashlib.sha256(body).hexdigest()

    client = TestClient(create_app(settings))
    listed = client.get("/v1/catalog").json()["items"]
    assert listed == [{key: manifest[key] for key in (
        "formation_id", "version", "title", "package_size", "package_sha256"
    )}]
    fetched = client.get("/v1/catalog/synthetic-course/1.0.0/manifest")
    assert fetched.status_code == 200
    assert fetched.json() == manifest
    package = client.get("/v1/catalog/synthetic-course/1.0.0/package")
    assert package.status_code == 200
    assert package.content == raw
    assert package.headers["content-length"] == str(len(raw))


def test_catalog_path_parameters_block_traversal(tmp_path):
    client = TestClient(create_app(settings_for(tmp_path)))
    attempts = [
        "/v1/catalog/..%2Fsecret/1.0.0/manifest",
        "/v1/catalog/synthetic-course/..%2F..%2Fsecret/package",
        "/v1/catalog/%2e%2e/1.0.0/package",
    ]
    for path in attempts:
        response = client.get(path)
        assert response.status_code in {404, 422}
        assert str(tmp_path).lower() not in response.text.lower()


def test_concurrent_duplicate_publication_never_removes_winning_package(tmp_path):
    settings = settings_for(tmp_path)
    db = Database(settings.database_path)
    db.initialize()
    source = tmp_path / "valid.zip"
    make_zip(source)

    def publish():
        return publish_package(
            db, settings.package_dir, source, "synthetic-course", "1.0.0", "Synthetic"
        )

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(publish), pool.submit(publish)]
    outcomes = []
    for future in futures:
        try:
            outcomes.append(future.result())
        except Exception as error:
            outcomes.append(error)
    assert sum(isinstance(item, dict) for item in outcomes) == 1
    record = db.get_package("synthetic-course", "1.0.0")
    assert record is not None
    stored = settings.package_dir / record["stored_path"]
    assert stored.is_file()
    assert hashlib.sha256(stored.read_bytes()).hexdigest() == record["package_sha256"]


def test_download_checks_containment_before_opening_file(tmp_path, monkeypatch):
    settings = settings_for(tmp_path)
    db = Database(settings.database_path)
    db.initialize()
    source = tmp_path / "valid.zip"
    make_zip(source)
    publish_package(db, settings.package_dir, source, "synthetic-course", "1.0.0", "Synthetic")
    with db.transaction() as connection:
        connection.execute("UPDATE catalog_packages SET stored_path = ?", ("../valid.zip",))
    original_open = Path.open
    def guarded_open(path, *args, **kwargs):
        if path.resolve() == source.resolve():
            raise AssertionError("outside file must never be opened")
        return original_open(path, *args, **kwargs)
    monkeypatch.setattr(Path, "open", guarded_open)
    client = TestClient(create_app(settings))
    assert client.get("/v1/catalog/synthetic-course/1.0.0/package").status_code == 404


def test_download_rejects_grown_package_before_read(tmp_path, monkeypatch):
    settings = settings_for(tmp_path)
    db = Database(settings.database_path)
    db.initialize()
    source = tmp_path / "valid.zip"
    make_zip(source)
    publish_package(db, settings.package_dir, source, "synthetic-course", "1.0.0", "Synthetic")
    stored = settings.package_dir / db.get_package("synthetic-course", "1.0.0")["stored_path"]
    with stored.open("ab") as output:
        output.write(b"unexpected growth")
    original_open = Path.open
    def guarded_open(path, *args, **kwargs):
        if path.resolve() == stored.resolve():
            raise AssertionError("oversized package must not be read")
        return original_open(path, *args, **kwargs)
    monkeypatch.setattr(Path, "open", guarded_open)
    client = TestClient(create_app(settings))
    assert client.get("/v1/catalog/synthetic-course/1.0.0/package").status_code == 503


def test_content_endpoint_uses_checked_package_bytes(tmp_path):
    settings = settings_for(tmp_path)
    db = Database(settings.database_path); db.initialize()
    source = tmp_path / "content.zip"; make_zip(source)
    publish_package(db, settings.package_dir, source, "synthetic-course", "1.0.0", "Synthetic")
    client = TestClient(create_app(settings))
    response = client.get("/v1/catalog/synthetic-course/1.0.0/content")
    assert response.status_code == 200
    assert set(response.json()["files"]) == set(REQUIRED)
    assert json.loads(response.json()["files"]["formation.json"])["id"] == "synthetic-course"
    stored = next(settings.package_dir.glob("*.zip"))
    stored.write_bytes(b"corrupted")
    assert client.get("/v1/catalog/synthetic-course/1.0.0/content").status_code == 503


def test_semantic_report_is_bound_to_exact_package_content(tmp_path):
    settings = settings_for(tmp_path); db = Database(settings.database_path); db.initialize()
    source = tmp_path / "content.zip"; make_zip(source)
    with zipfile.ZipFile(source) as archive:
        hashes = {name: hashlib.sha256(archive.read(name)).hexdigest() for name in REQUIRED}
    report = dict(valid=True, formationId="synthetic-course", packageVersion="1.0.0", sha256=hashes)
    with pytest.raises(PackageValidationError, match="does not match"):
        publish_package(db, settings.package_dir, source, "synthetic-course", "1.0.0", "Synthetic", validation_report={**report, 'valid':False})
    assert db.list_catalog() == []
    with pytest.raises(PackageValidationError, match="does not match"):
        publish_package(db, settings.package_dir, source, "synthetic-course", "1.0.0", "Synthetic", validation_report={**report, 'sha256':{}})
    assert db.list_catalog() == []
    publish_package(db, settings.package_dir, source, "synthetic-course", "1.0.0", "Synthetic", validation_report=report)
