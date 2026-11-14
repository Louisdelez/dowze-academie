"""Actual FastAPI/TestClient and SQLite transactions; no network or PostgreSQL."""
from contextlib import closing
from datetime import datetime, timedelta, timezone
import hashlib
from uuid import uuid4

from fastapi.testclient import TestClient
import pytest

from app.backup_bundle import create_bundle, restore_bundle
from app.config import Settings
from app.main import create_app
from app.notebook_acl_schema import NOTEBOOK_TABLES
from app.security import revoke_session, rotate_csrf
from app.sync import canonical_json
from test_sync import make_app, authenticated_client, create_space, mutation_headers, put_document, ORIGIN


def proof(content, version=1):
    return {"version": version, "sha256": hashlib.sha256(canonical_json(content).encode("utf-8")).hexdigest()}


@pytest.fixture
def scenario(tmp_path):
    app, settings = make_app(tmp_path / "live", quota=100_000, max_document=10_000)
    assert app.state.db.backend == "sqlite" and settings.database_url is None
    app.state.now = lambda: datetime(2026, 10, 15, 12, tzinfo=timezone.utc)
    owner, owner_csrf = authenticated_client(app, "owner@example.com")
    recipient, recipient_csrf = authenticated_client(app, "recipient@example.com")
    owner_id, recipient_id = owner.get("/v1/me").json()["id"], recipient.get("/v1/me").json()["id"]
    assert create_space(owner, owner_csrf, "year-one").status_code == 201
    assert create_space(recipient, recipient_csrf, "year-one").status_code == 201
    canonical = {"notebookSchema": 3, "noteId": "note-a", "revision": 0,
                 "updatedAt": "2026-10-15T12:00:00+00:00", "pages": [{"id": "page-a", "width": 794, "height": 1123, "pattern": "plain", "color": "#ffffff", "bookmark": False, "rotation": 0}],
                 "objects": [], "assets": [], "audio": [], "legacy": {"markdown": "", "boardId": "note-a", "migratedAt": "2026-10-15T12:00:00+00:00"},
                 "collaboration": {"schema": 1, "lineage": "lineage-a", "state": "AAA="}}
    metadata = {"id": "note-a", "title": "Private source", "markdown": "", "updatedAt": "2026-10-15T12:00:00+00:00"}
    assert put_document(owner, owner_csrf, "year-one", "whiteboard", "paper-safe-id", 0, canonical, "paper-seed").status_code == 200
    assert put_document(owner, owner_csrf, "year-one", "notesMarkdown", "metadata-safe-id", 0, metadata, "metadata-seed").status_code == 200
    foreign = {"title": "Recipient private", "text": "must never be disclosed or changed"}
    assert put_document(recipient, recipient_csrf, "year-one", "planning", "foreign", 0, foreign, "foreign-seed").status_code == 200
    source = {"protocol": "dowze-managed-notebook@1", "private_write_policy": "managed-only", "space_id": "year-one", "note_id": "note-a",
              "canonical_document_id": "paper-safe-id", "metadata_document_id": "metadata-safe-id", "lineage": "lineage-a",
              "canonical": proof(canonical), "metadata": proof(metadata)}
    value = dict(app=app, settings=settings, owner=owner, recipient=recipient, owner_id=owner_id, recipient_id=recipient_id,
                 owner_csrf=owner_csrf, recipient_csrf=recipient_csrf, resource_id=str(uuid4()), source=source, canonical=canonical, metadata=metadata)
    try:
        yield value
    finally:
        recipient.close()
        owner.close()


def headers(s, actor="owner", key=None):
    return {**mutation_headers(s[f"{actor}_csrf"], key), "X-Dowze-Account": s[f"{actor}_id"]}


def register(s, key="register", source=None):
    return s["owner"].put(f'/v1/notebooks/{s["resource_id"]}', headers=headers(s, key=key), json=source or s["source"])


def descriptor(s):
    response = s["owner"].get(f'/v1/notebooks/{s["resource_id"]}', headers={"X-Dowze-Account": s["owner_id"]})
    assert response.status_code == 200, response.json()
    return response.json()


def invite(s, *, ttl=3600, role="viewer", key="invite", invitation_id=None):
    invitation_id = invitation_id or str(uuid4())
    current = descriptor(s)
    body = {"incarnation": current["incarnation"], "base_acl_version": current["acl_version"], "recipient_account_id": s["recipient_id"], "role": role, "ttl_seconds": ttl}
    response = s["owner"].put(f'/v1/notebooks/{s["resource_id"]}/invitations/{invitation_id}', headers=headers(s, key=key), json=body)
    assert response.status_code == 201, response.json()
    return response, body


def accept(s, invitation, key="accept"):
    body = {"incarnation": invitation["incarnation"], "invitation_version": invitation["version"]}
    return s["recipient"].post(f'/v1/notebooks/{s["resource_id"]}/invitations/{invitation["id"]}/accept', headers=headers(s, "recipient", key), json=body)


def durable(s):
    with closing(s["app"].state.db.connect()) as connection:
        return {table: [dict(row) for row in connection.execute(f'SELECT * FROM "{table}" ORDER BY 1,2')]
                for table in ("sync_documents", "sync_changes", "sync_blobs", "sync_blob_refs", "sync_idempotency", *NOTEBOOK_TABLES)}


def test_registration_is_exact_opt_in_with_stable_receipt_and_foreign_storage(scenario):
    s = scenario
    before = durable(s)
    first, retry = register(s), register(s)
    assert first.status_code == retry.status_code == 201 and first.json() == retry.json()
    result = first.json()
    assert result["acl_version"] == result["resource_version"] == 1
    assert result["capabilities"] == {"read_documents": True, "write_documents": False, "read_blobs": False, "manage_acl": True}
    assert result["canonical_document_id"] == "paper-safe-id"  # no guessed note-ID prefix
    after = durable(s)
    for table in ("sync_documents", "sync_changes", "sync_blobs", "sync_blob_refs", "sync_idempotency"):
        assert after[table] == before[table]
    assert len(after["notebook_resources"]) == len(after["notebook_receipts"]) == 1
    assert register(s, "other-key").status_code == 409
    changed = {**s["source"], "lineage": "other"}
    assert register(s, source=changed).status_code == 422


def test_bad_source_proofs_or_incarnation_leave_no_managed_rows(scenario):
    s = scenario
    baseline = durable(s)
    for field, invalid in (("canonical", {**s["source"]["canonical"], "sha256": "0" * 64}), ("metadata", {**s["source"]["metadata"], "version": 2}), ("lineage", "other-lineage"), ("note_id", "other-note")):
        response = register(s, source={**s["source"], field: invalid})
        assert response.status_code == 409, response.json()
        assert durable(s) == baseline
    unsafe = {**s["source"], "private_write_policy": "silently-use-legacy"}
    assert register(s, source=unsafe).status_code == 400
    assert durable(s) == baseline


def test_compressed_source_requires_explicit_verified_adapter(scenario):
    s = scenario
    envelope = {"notebookEnvelope": 3, "noteId": "note-a", "revision": 0, "body_id": "unproven-body"}
    assert put_document(s["owner"], s["owner_csrf"], "year-one", "whiteboard", "paper-safe-id", 1, envelope, "envelope").status_code == 200
    response = register(s, source={**s["source"], "canonical": proof(envelope, 2)})
    assert response.status_code == 409 and response.json()["code"] == "managed_notebook_envelope_requires_adapter"
    assert durable(s)["notebook_resources"] == []


def test_explicit_management_blocks_legacy_writes_before_old_receipt(scenario):
    s = scenario
    assert register(s).status_code == 201
    before = durable(s)
    replay = put_document(s["owner"], s["owner_csrf"], "year-one", "whiteboard", "paper-safe-id", 0, s["canonical"], "paper-seed")
    assert replay.status_code == 409 and replay.json()["code"] == "managed_notebook_protocol_required"
    removed = s["owner"].delete('/v1/spaces/year-one/documents/notesMarkdown/metadata-safe-id?base_version=1', headers=mutation_headers(s["owner_csrf"], "legacy-delete"))
    assert removed.status_code == 409 and durable(s) == before
    # Ordinary nonmanaged callers preserve their previous writer/receipt contract.
    ordinary = put_document(s["owner"], s["owner_csrf"], "year-one", "notesMarkdown", "ordinary", 0, {"text": "private"}, "ordinary")
    assert ordinary.status_code == 200
    assert put_document(s["owner"], s["owner_csrf"], "year-one", "notesMarkdown", "ordinary", 0, {"text": "private"}, "ordinary").json() == ordinary.json()


def test_in_app_invitation_acceptance_replays_exactly_without_owner_space_access(scenario):
    s = scenario
    assert register(s).status_code == 201
    response, body = invite(s, role="editor")
    invitation = response.json()
    pending = s["recipient"].get('/v1/notebook-invitations', headers={"X-Dowze-Account": s["recipient_id"]}).json()
    assert len(pending["items"]) == 1 and pending["items"][0]["id"] == invitation["id"]
    owner_retry = s["owner"].put(f'/v1/notebooks/{s["resource_id"]}/invitations/{invitation["id"]}', headers=headers(s, key="invite"), json=body)
    assert owner_retry.status_code == 201 and owner_retry.json() == invitation
    first, replay = accept(s, invitation), accept(s, invitation)
    assert first.status_code == replay.status_code == 200 and first.json() == replay.json()
    shared = s["recipient"].get(f'/v1/notebooks/{s["resource_id"]}/documents', headers={"X-Dowze-Account": s["recipient_id"]})
    assert shared.status_code == 200 and shared.json()["role"] == "editor"
    assert [row["content"] for row in shared.json()["documents"]] == [s["canonical"], s["metadata"]]
    assert shared.json()["capabilities"]["write_documents"] is False
    assert s["recipient"].get(f'/v1/spaces/year-one/changes').json()["items"][0]["content"]["title"] == "Recipient private"
    wrong_owner_header = s["recipient"].get(f'/v1/notebooks/{s["resource_id"]}/documents', headers={"X-Dowze-Account": s["owner_id"]})
    assert wrong_owner_header.status_code == 409 and wrong_owner_header.json()["code"] == "session_account_changed"


def test_non_recipient_cannot_accept_or_manage_an_invitation(scenario):
    s = scenario
    assert register(s).status_code == 201
    invitation = invite(s)[0].json()
    before = durable(s)
    body = {"incarnation": invitation["incarnation"], "invitation_version": 1}
    response = s["owner"].post(f'/v1/notebooks/{s["resource_id"]}/invitations/{invitation["id"]}/accept', headers=headers(s, key="wrong-accept"), json=body)
    assert response.status_code == 404 and durable(s) == before
    other = {"incarnation": invitation["incarnation"], "base_acl_version": 2, "recipient_account_id": s["owner_id"], "role": "editor", "ttl_seconds": 60}
    denied = s["recipient"].put(f'/v1/notebooks/{s["resource_id"]}/invitations/{uuid4()}', headers=headers(s, "recipient", "not-owner"), json=other)
    assert denied.status_code == 404 and durable(s) == before


def test_revoke_denies_prior_accept_receipt_and_new_key_without_regrant(scenario):
    s = scenario
    assert register(s).status_code == 201
    invitation = invite(s)[0].json()
    assert accept(s, invitation).status_code == 200
    current = descriptor(s)
    body = {"incarnation": current["incarnation"], "base_acl_version": current["acl_version"]}
    url = f'/v1/notebooks/{s["resource_id"]}/grants/{s["recipient_id"]}'
    revoked = s["owner"].request("DELETE", url, headers=headers(s, key="revoke"), json=body)
    replay = s["owner"].request("DELETE", url, headers=headers(s, key="revoke"), json=body)
    assert revoked.status_code == replay.status_code == 200 and revoked.json() == replay.json()
    before = durable(s)
    assert accept(s, invitation).status_code == 410
    assert accept(s, invitation, "new-accept-key").status_code == 410
    assert s["recipient"].get(f'/v1/notebooks/{s["resource_id"]}/documents', headers={"X-Dowze-Account": s["recipient_id"]}).status_code == 404
    assert durable(s) == before
    next_invitation = invite(s, key="new-invite")[0].json()
    fresh = accept(s, next_invitation, "fresh-accept")
    assert fresh.status_code == 200 and fresh.json()["access_version"] == 3
    assert accept(s, invitation).status_code == 410
    assert descriptor(s)["acl_version"] == 6


def test_invitation_expiry_precedes_receipt_replay(scenario):
    s = scenario
    assert register(s).status_code == 201
    invitation_response, body = invite(s, ttl=60)
    invitation = invitation_response.json()
    assert accept(s, invitation).status_code == 200
    before = durable(s)
    s["app"].state.now = lambda: datetime(2026, 10, 15, 12, 1, tzinfo=timezone.utc)
    assert accept(s, invitation).status_code == 410
    replay = s["owner"].put(f'/v1/notebooks/{s["resource_id"]}/invitations/{invitation["id"]}', headers=headers(s, key="invite"), json=body)
    assert replay.status_code == 410
    assert durable(s) == before


def test_session_revocation_between_middleware_and_transaction_denies_old_receipt(scenario, monkeypatch):
    s = scenario
    assert register(s).status_code == 201
    before = durable(s)
    import app.main as main_module
    original, seen = main_module.get_session, []
    def observed_then_revoked(db, token, now):
        session = original(db, token, now)
        if session is not None and not seen:
            seen.append(session["session_id"])
            revoke_session(db, session["session_id"], now)
        return session
    monkeypatch.setattr(main_module, "get_session", observed_then_revoked)
    replay = register(s)
    assert seen and replay.status_code == 401 and replay.json()["code"] == "invalid_session"
    assert durable(s) == before


def test_csrf_rotation_between_middleware_and_transaction_denies_old_receipt(scenario, monkeypatch):
    s = scenario
    assert register(s).status_code == 201
    before = durable(s)
    import app.main as main_module
    original, seen = main_module.get_session, []
    def observed_then_rotated(db, token, now):
        session = original(db, token, now)
        if session is not None and not seen:
            seen.append(rotate_csrf(db, session["session_id"]))
        return session
    monkeypatch.setattr(main_module, "get_session", observed_then_rotated)
    replay = register(s)
    assert len(seen) == 1 and replay.status_code == 403 and replay.json()["code"] == "csrf_rejected"
    assert durable(s) == before


def test_acl_cas_and_incarnation_conflicts_preserve_all_storage(scenario):
    s = scenario
    assert register(s).status_code == 201
    current = descriptor(s)
    before = durable(s)
    for incarnation, base in ((current["incarnation"], 2), (str(uuid4()), 1)):
        body = {"incarnation": incarnation, "base_acl_version": base, "recipient_account_id": s["recipient_id"], "role": "viewer", "ttl_seconds": 60}
        response = s["owner"].put(f'/v1/notebooks/{s["resource_id"]}/invitations/{uuid4()}', headers=headers(s, key="cas-refusal"), json=body)
        assert response.status_code == 409 and durable(s) == before


def test_managed_reads_refuse_changed_lineage_and_terminal_state_before_receipts(scenario):
    s = scenario
    assert register(s).status_code == 201
    db = s["app"].state.db
    # Explicit storage fault/race seam, not a legal managed writer or lifecycle API.
    changed = {**s["canonical"], "collaboration": {**s["canonical"]["collaboration"], "lineage": "replacement"}}
    with db.transaction() as connection:
        connection.execute("UPDATE sync_documents SET content_json=? WHERE account_id=? AND document_type='whiteboard'", (canonical_json(changed), s["owner_id"]))
    baseline = durable(s)
    response = s["owner"].get(f'/v1/notebooks/{s["resource_id"]}', headers={"X-Dowze-Account": s["owner_id"]})
    assert response.status_code == 409 and durable(s) == baseline
    with db.transaction() as connection:
        connection.execute("UPDATE sync_documents SET content_json=? WHERE account_id=? AND document_type='whiteboard'", (canonical_json(s["canonical"]), s["owner_id"]))
        connection.execute("UPDATE notebook_resources SET state='purged',resource_version=2,acl_version=2 WHERE id=?", (s["resource_id"],))
    terminal = durable(s)
    assert register(s).status_code == 410
    assert durable(s) == terminal  # terminal ID/incarnation and versions remain stored


def test_expected_actor_origin_csrf_and_strict_body_are_required(scenario):
    s = scenario
    before = durable(s)
    url = f'/v1/notebooks/{s["resource_id"]}'
    for selected in (mutation_headers(s["owner_csrf"], "missing-actor"), {**headers(s, key="bad-csrf"), "X-CSRF-Token": "invalid"}, {**headers(s, key="bad-origin"), "Origin": "https://other.invalid"}):
        response = s["owner"].put(url, headers=selected, json=s["source"])
        assert response.status_code in (400, 403) and durable(s) == before
    assert register(s, source={**s["source"], "owner_account_id": s["recipient_id"]}).status_code == 400
    assert durable(s) == before


def test_backup_restore_preserves_acl_revocations_and_receipts(scenario, tmp_path):
    s = scenario
    assert register(s).status_code == 201
    invitation = invite(s)[0].json()
    assert accept(s, invitation).status_code == 200
    current = descriptor(s)
    revoked = s["owner"].request("DELETE", f'/v1/notebooks/{s["resource_id"]}/invitations/{invitation["id"]}', headers=headers(s, key="revoke-invitation"), json={"incarnation": current["incarnation"], "base_acl_version": current["acl_version"]})
    assert revoked.status_code == 200
    before = durable(s)
    create_bundle(s["settings"], tmp_path / "bundle")
    restore_bundle(tmp_path / "bundle", tmp_path / "restored")
    settings = Settings(**{**s["settings"].__dict__, "database_path": tmp_path / "restored/api.sqlite3", "blob_dir": tmp_path / "restored/blobs", "package_dir": tmp_path / "restored/packages"})
    app = create_app(settings)
    app.state.now = s["app"].state.now
    restored = {**s, "app": app}
    assert durable(restored) == before
    with TestClient(app) as client:
        client.cookies.update(s["recipient"].cookies)
        denied = client.get(f'/v1/notebooks/{s["resource_id"]}/documents', headers={"X-Dowze-Account": s["recipient_id"]})
        assert denied.status_code == 404
        client.cookies.update(s["owner"].cookies)
        replay = client.put(f'/v1/notebooks/{s["resource_id"]}', headers=headers(s, key="register"), json=s["source"])
        assert replay.status_code == 201 and replay.json()["incarnation"] == current["incarnation"]
