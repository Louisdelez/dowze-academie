from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import hashlib

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

ORIGIN = "https://app.example.invalid"
PASSWORD = "correct-horse-battery"


def make_app(tmp_path, *, quota=2_000, max_document=1_000, max_blob=1_000, max_request=4_096):
    settings = Settings(
        environment="test",
        database_path=tmp_path / "api.sqlite3",
        package_dir=tmp_path / "packages",
        blob_dir=tmp_path / "blobs",
        allowed_origins=(ORIGIN,),
        session_ttl_seconds=3600,
        request_limit_per_minute=10_000,
        max_request_bytes=max_request,
        sync_account_quota_bytes=quota,
        sync_max_document_bytes=max_document,
        sync_max_blob_bytes=max_blob,
    )
    return create_app(settings), settings


def authenticated_client(app, email):
    client = TestClient(app)
    assert client.post(
        "/v1/accounts", headers={"Origin": ORIGIN}, json={"email": email, "password": PASSWORD}
    ).status_code == 201
    login = client.post(
        "/v1/sessions", headers={"Origin": ORIGIN}, json={"email": email, "password": PASSWORD}
    )
    assert login.status_code == 201
    return client, login.json()["csrf_token"]


def mutation_headers(csrf, key=None):
    headers = {"Origin": ORIGIN, "X-CSRF-Token": csrf}
    if key:
        headers["X-Idempotency-Key"] = key
    return headers


def create_space(client, csrf, space_id, formation="formation-1", year="2026-2027"):
    return client.put(
        f"/v1/spaces/{space_id}",
        headers=mutation_headers(csrf),
        json={"formation_id": formation, "academic_year": year, "title": year},
    )


def put_document(client, csrf, space, kind, document, base, content, key):
    return client.put(
        f"/v1/spaces/{space}/documents/{kind}/{document}",
        headers=mutation_headers(csrf, key),
        json={"base_version": base, "content": content},
    )


def test_two_accounts_and_two_years_are_strictly_isolated(tmp_path):
    app, _ = make_app(tmp_path)
    alpha, alpha_csrf = authenticated_client(app, "alpha@example.com")
    beta, beta_csrf = authenticated_client(app, "beta@example.com")
    assert create_space(alpha, alpha_csrf, "alpha-2026", year="2026-2027").status_code == 201
    assert create_space(alpha, alpha_csrf, "alpha-2027", year="2027-2028").status_code == 201
    assert create_space(beta, beta_csrf, "beta-2026", year="2026-2027").status_code == 201
    assert create_space(beta, beta_csrf, "beta-2027", year="2027-2028").status_code == 201

    first = put_document(alpha, alpha_csrf, "alpha-2026", "notesMarkdown", "note-1", 0, {"text": "A"}, "alpha-1")
    second = put_document(alpha, alpha_csrf, "alpha-2027", "notesMarkdown", "note-1", 0, {"text": "B"}, "alpha-2")
    assert first.status_code == second.status_code == 200
    assert beta.get("/v1/spaces/alpha-2026/changes").status_code == 404
    assert alpha.get("/v1/spaces/alpha-2026/changes").json()["items"][0]["content"] == {"text": "A"}
    assert alpha.get("/v1/spaces/alpha-2027/changes").json()["items"][0]["content"] == {"text": "B"}


def test_cookie_account_change_cannot_upload_another_accounts_offline_work(tmp_path):
    app, _ = make_app(tmp_path)
    alpha, alpha_csrf = authenticated_client(app, "alpha@example.com")
    beta, beta_csrf = authenticated_client(app, "beta@example.com")
    alpha_id = alpha.get("/v1/me").json()["id"]
    assert create_space(beta, beta_csrf, "same-space").status_code == 201
    headers = {**mutation_headers(beta_csrf, "offline-a"), "X-Dowze-Account": alpha_id}
    response = beta.put("/v1/spaces/same-space/documents/notesMarkdown/private-a", headers=headers,
                        json={"base_version": 0, "content": {"markdown": "account A only"}})
    assert response.status_code == 409
    assert response.json()["code"] == "session_account_changed"
    assert beta.get("/v1/spaces/same-space/changes").json()["items"] == []
    assert beta.get("/v1/spaces/same-space/changes", headers={"X-Dowze-Account": alpha_id}).status_code == 409


def test_all_document_kinds_require_explicit_space_and_session_account(tmp_path):
    app, _ = make_app(tmp_path, quota=20_000)
    client, csrf = authenticated_client(app, "alpha@example.com")
    assert create_space(client, csrf, "year-a").status_code == 201
    kinds = ["notesMarkdown", "whiteboard", "planning", "progression", "examens", "conversations", "tasks", "formation", "preferences"]
    for index, kind in enumerate(kinds):
        response = put_document(client, csrf, "year-a", kind, f"doc-{index}", 0, {"kind": kind}, f"key-{index}")
        assert response.status_code == 200
        assert response.json()["space_id"] == "year-a"
    assert client.put(
        "/v1/spaces/year-a/documents/notesMarkdown/bad",
        headers=mutation_headers(csrf, "body-account"),
        json={"base_version": 0, "content": {}, "account_id": "attacker"},
    ).status_code == 400
    assert client.put(
        "/v1/spaces/year-a/documents/planning/non-object",
        headers=mutation_headers(csrf, "non-object"),
        json={"base_version": 0, "content": ["not", "an", "object"]},
    ).status_code == 400


def test_conflict_preserves_value_and_idempotent_retry_replays_exact_result(tmp_path):
    app, _ = make_app(tmp_path)
    client, csrf = authenticated_client(app, "alpha@example.com")
    create_space(client, csrf, "year-a")
    created = put_document(client, csrf, "year-a", "notesMarkdown", "note", 0, {"text": "old"}, "create")
    assert created.status_code == 200 and created.json()["version"] == 1
    successful_replay = put_document(client, csrf, "year-a", "notesMarkdown", "note", 0, {"text": "old"}, "create")
    assert successful_replay.status_code == 200 and successful_replay.json() == created.json()

    conflict = put_document(client, csrf, "year-a", "notesMarkdown", "note", 0, {"text": "new"}, "conflict")
    replay = put_document(client, csrf, "year-a", "notesMarkdown", "note", 0, {"text": "new"}, "conflict")
    assert conflict.status_code == replay.status_code == 409
    assert conflict.json() == replay.json() == {
        "code": "version_conflict", "message": "Base version does not match", "current_version": 1
    }
    changes = client.get("/v1/spaces/year-a/changes").json()["items"]
    assert len(changes) == 1 and changes[0]["content"] == {"text": "old"}

    reused = put_document(client, csrf, "year-a", "notesMarkdown", "note", 1, {"text": "different"}, "create")
    assert reused.status_code == 422
    assert reused.json()["code"] == "idempotency_key_reused"


def test_concurrent_writers_cannot_silently_overwrite(tmp_path):
    app, _ = make_app(tmp_path)
    setup, csrf = authenticated_client(app, "alpha@example.com")
    create_space(setup, csrf, "year-a")
    assert put_document(setup, csrf, "year-a", "planning", "plan", 0, {"winner": None}, "initial").status_code == 200
    cookie = setup.cookies.get("dowze_session")

    def write(value):
        client = TestClient(app)
        client.cookies.set("dowze_session", cookie)
        return put_document(client, csrf, "year-a", "planning", "plan", 1, {"winner": value}, f"race-{value}")

    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(write, ["one", "two"]))
    assert sorted(response.status_code for response in responses) == [200, 409]
    changes = setup.get("/v1/spaces/year-a/changes").json()["items"]
    assert [item["version"] for item in changes] == [1, 2]


def test_tombstones_and_server_cursors_paginate_without_loss(tmp_path):
    app, _ = make_app(tmp_path, quota=10_000)
    client, csrf = authenticated_client(app, "alpha@example.com")
    create_space(client, csrf, "year-a")
    for index in range(3):
        assert put_document(client, csrf, "year-a", "progression", f"doc-{index}", 0, {"i": index}, f"create-{index}").status_code == 200

    first = client.get("/v1/spaces/year-a/changes", params={"limit": 2}).json()
    assert len(first["items"]) == 2 and first["has_more"] is True and first["next_cursor"]
    second = client.get("/v1/spaces/year-a/changes", params={"limit": 2, "cursor": first["next_cursor"]}).json()
    assert len(second["items"]) == 1 and second["has_more"] is False
    assert {item["document_id"] for item in first["items"] + second["items"]} == {"doc-0", "doc-1", "doc-2"}
    create_space(client, csrf, "year-b", year="2027-2028")
    assert client.get("/v1/spaces/year-b/changes", params={"cursor": first["next_cursor"]}).status_code == 400
    forged = first["next_cursor"][:-1] + ("A" if first["next_cursor"][-1] != "A" else "B")
    assert client.get("/v1/spaces/year-a/changes", params={"cursor": forged}).status_code == 400

    deleted = client.delete(
        "/v1/spaces/year-a/documents/progression/doc-1",
        headers=mutation_headers(csrf, "delete-1"),
        params={"base_version": 1},
    )
    assert deleted.status_code == 200 and deleted.json()["deleted"] is True and deleted.json()["version"] == 2
    replay = client.delete(
        "/v1/spaces/year-a/documents/progression/doc-1",
        headers=mutation_headers(csrf, "delete-1"),
        params={"base_version": 1},
    )
    assert replay.json() == deleted.json()
    latest = client.get("/v1/spaces/year-a/changes", params={"cursor": second["next_cursor"]}).json()
    assert latest["items"][0]["deleted"] is True


def test_utf8_size_and_account_quota_are_enforced_atomically(tmp_path):
    app, _ = make_app(tmp_path, quota=80, max_document=60)
    client, csrf = authenticated_client(app, "alpha@example.com")
    create_space(client, csrf, "year-a")
    too_large = put_document(client, csrf, "year-a", "notesMarkdown", "large", 0, {"text": "é" * 30}, "large")
    assert too_large.status_code == 413 and too_large.json()["code"] == "document_too_large"

    first = put_document(client, csrf, "year-a", "notesMarkdown", "one", 0, {"text": "x" * 20}, "one")
    assert first.status_code == 200
    quota = put_document(client, csrf, "year-a", "notesMarkdown", "two", 0, {"text": "y" * 40}, "two")
    assert quota.status_code == 413 and quota.json()["code"] == "account_quota_exceeded"
    assert len(client.get("/v1/spaces/year-a/changes").json()["items"]) == 1


def test_csrf_can_be_rotated_after_reload_and_revoked_session_is_refused(tmp_path):
    app, _ = make_app(tmp_path)
    client, old_csrf = authenticated_client(app, "alpha@example.com")
    refreshed = client.get("/v1/csrf")
    assert refreshed.status_code == 200 and refreshed.json()["csrf_token"] != old_csrf
    new_csrf = refreshed.json()["csrf_token"]
    assert create_space(client, old_csrf, "old-token").status_code == 403
    assert create_space(client, new_csrf, "year-a").status_code == 201
    assert client.delete("/v1/sessions", headers=mutation_headers(new_csrf)).status_code == 204
    assert client.get("/v1/csrf").status_code == 401
    assert create_space(client, new_csrf, "after-revoke").status_code == 401


def test_private_blob_hash_ownership_references_and_deletion(tmp_path):
    app, settings = make_app(tmp_path, quota=5_000, max_blob=1_000)
    alpha, alpha_csrf = authenticated_client(app, "alpha@example.com")
    beta, _ = authenticated_client(app, "beta@example.com")
    create_space(alpha, alpha_csrf, "year-a")
    body = b"synthetic-photo"
    digest = hashlib.sha256(body).hexdigest()
    wrong = alpha.post(
        "/v1/spaces/year-a/blobs",
        headers={**mutation_headers(alpha_csrf, "blob-wrong"), "Content-Type": "image/jpeg", "X-Content-SHA256": "0" * 64},
        content=body,
    )
    assert wrong.status_code == 422 and wrong.json()["code"] == "hash_mismatch"
    uploaded = alpha.post(
        "/v1/spaces/year-a/blobs",
        headers={**mutation_headers(alpha_csrf, "blob-ok"), "Content-Type": "image/jpeg", "X-Content-SHA256": digest},
        content=body,
    )
    assert uploaded.status_code == 201
    blob_id = uploaded.json()["id"]
    stored = list(settings.blob_dir.iterdir())
    assert len(stored) == 1 and blob_id not in str(stored[0]) and stored[0].read_bytes() == body
    assert beta.get(f"/v1/spaces/year-a/blobs/{blob_id}").status_code == 404
    download = alpha.get(f"/v1/spaces/year-a/blobs/{blob_id}")
    assert download.status_code == 200 and download.content == body
    assert create_space(alpha, alpha_csrf, "year-b", year="2027-2028").status_code == 201
    assert alpha.get(f"/v1/spaces/year-b/blobs/{blob_id}").status_code == 404

    referenced = put_document(alpha, alpha_csrf, "year-a", "whiteboard", "board", 0, {"blob_ids": [blob_id]}, "board")
    assert referenced.status_code == 200
    assert alpha.delete(f"/v1/spaces/year-a/blobs/{blob_id}", headers=mutation_headers(alpha_csrf, "delete-blob")).status_code == 409
    assert alpha.delete(
        "/v1/spaces/year-a/documents/whiteboard/board",
        headers=mutation_headers(alpha_csrf, "delete-board"),
        params={"base_version": 1},
    ).status_code == 200
    assert alpha.delete(f"/v1/spaces/year-a/blobs/{blob_id}", headers=mutation_headers(alpha_csrf, "delete-blob-2")).status_code == 204
    assert not stored[0].exists()


def test_document_limit_is_not_shadowed_by_small_generic_request_limit(tmp_path):
    app, _ = make_app(tmp_path, quota=100_000, max_document=50_000, max_request=4_096)
    client, csrf = authenticated_client(app, "alpha@example.com")
    create_space(client, csrf, "year-a")
    response = put_document(
        client, csrf, "year-a", "notesMarkdown", "large-note", 0,
        {"text": "é" * 10_000}, "large-note",
    )
    assert response.status_code == 200


def test_blob_directory_is_reconciled_after_interrupted_delete(tmp_path):
    app, settings = make_app(tmp_path, quota=5_000, max_blob=1_000)
    client, csrf = authenticated_client(app, "alpha@example.com")
    create_space(client, csrf, "year-a")
    body = b"synthetic-photo"
    uploaded = client.post(
        "/v1/spaces/year-a/blobs",
        headers={**mutation_headers(csrf, "blob-recovery"), "Content-Type": "image/jpeg", "X-Content-SHA256": hashlib.sha256(body).hexdigest()},
        content=body,
    ).json()
    stored = next(settings.blob_dir.glob("*.blob"))
    interrupted = stored.with_name(stored.name + ".deleting")
    stored.replace(interrupted)
    orphan = settings.blob_dir / ("f" * 64 + ".blob")
    orphan.write_bytes(b"orphan")

    restarted = TestClient(create_app(settings))
    restarted.cookies.set("dowze_session", client.cookies.get("dowze_session"))
    assert restarted.get(f"/v1/spaces/year-a/blobs/{uploaded['id']}").content == body
    assert stored.exists() and not interrupted.exists() and not orphan.exists()


def test_blob_media_type_size_and_document_blob_scope_are_rejected(tmp_path):
    app, _ = make_app(tmp_path, quota=5_000, max_blob=5)
    client, csrf = authenticated_client(app, "alpha@example.com")
    create_space(client, csrf, "year-a")
    create_space(client, csrf, "year-b", year="2027-2028")
    oversized = b"123456"
    response = client.post(
        "/v1/spaces/year-a/blobs",
        headers={**mutation_headers(csrf, "oversized"), "Content-Type": "application/pdf", "X-Content-SHA256": hashlib.sha256(oversized).hexdigest()},
        content=oversized,
    )
    assert response.status_code == 413 and response.json()["code"] == "blob_too_large"


def test_idempotency_capacity_rolls_back_document_and_preserves_replay(tmp_path, monkeypatch):
    import app.sync as sync
    app, _ = make_app(tmp_path)
    client, csrf = authenticated_client(app, "capacity@example.com")
    assert create_space(client, csrf, "year-a").status_code == 201
    monkeypatch.setattr(sync, "MAX_IDEMPOTENCY_RECORDS", 1)
    first = put_document(client, csrf, "year-a", "notesMarkdown", "note", 0, {"text":"first"}, "first-key")
    assert first.status_code in (200, 201)
    rejected = put_document(client, csrf, "year-a", "notesMarkdown", "note", 1, {"text":"must roll back"}, "second-key")
    assert rejected.status_code == 429
    assert rejected.json()["code"] == "idempotency_capacity"
    with app.state.db.connect() as connection:
        row = connection.execute("SELECT version, content_json FROM sync_documents WHERE document_id = 'note'").fetchone()
        assert row["version"] == 1
        assert "must roll back" not in row["content_json"]
    replay = put_document(client, csrf, "year-a", "notesMarkdown", "note", 0, {"text":"first"}, "first-key")
    assert replay.status_code == first.status_code
    assert replay.json() == first.json()


def test_reconciliation_waits_for_concurrent_blob_transaction(tmp_path):
    import threading
    from concurrent.futures import TimeoutError
    import pytest
    from app.sync import reconcile_blob_directory
    app, settings = make_app(tmp_path)
    client, csrf = authenticated_client(app, "reconcile@example.com")
    create_space(client, csrf, "year-a")
    body = b"synthetic-photo"
    uploaded = client.post("/v1/spaces/year-a/blobs", headers={
        **mutation_headers(csrf, "blob1"), "Content-Type":"image/jpeg",
        "X-Content-SHA256":hashlib.sha256(body).hexdigest()}, content=body)
    assert uploaded.status_code == 201
    new_name = "a" * 64 + ".blob"
    started = threading.Event()
    def reconcile():
        started.set()
        reconcile_blob_directory(app.state.db, settings.blob_dir)
    with ThreadPoolExecutor(max_workers=1) as pool:
        with app.state.db.transaction() as connection:
            (settings.blob_dir/new_name).write_bytes(body)
            connection.execute("UPDATE sync_blobs SET stored_name = ? WHERE id = ?", (new_name, uploaded.json()["id"]))
            future = pool.submit(reconcile)
            assert started.wait(2)
            with pytest.raises(TimeoutError):
                future.result(timeout=0.15)
        future.result(timeout=3)
    assert (settings.blob_dir/new_name).read_bytes() == body


def test_spaces_list_is_private_and_paginated(tmp_path):
    app, _ = make_app(tmp_path)
    a, ca = authenticated_client(app, "spaces-a@example.com")
    b, cb = authenticated_client(app, "spaces-b@example.com")
    for name in ("a", "b", "c"):
        assert create_space(a, ca, name).status_code == 201
    assert create_space(b, cb, "private").status_code == 201
    assert TestClient(app).get("/v1/spaces").status_code == 401
    page = a.get("/v1/spaces?limit=2").json()
    assert [x["id"] for x in page["items"]] == ["a", "b"]
    assert page["has_more"] and page["next_after"] == "b"
    last = a.get("/v1/spaces?limit=2&after=b").json()
    assert [x["id"] for x in last["items"]] == ["c"]
    assert not last["has_more"]
    assert [x["id"] for x in b.get("/v1/spaces").json()["items"]] == ["private"]
