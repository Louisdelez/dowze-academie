from __future__ import annotations

from datetime import datetime, timedelta, timezone
from app.db import Database

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

ORIGIN = "https://app.example.invalid"


def make_client(tmp_path, *, production: bool = False, request_limit: int = 100):
    settings = Settings(
        environment="production" if production else "test",
        database_path=tmp_path / "api.sqlite3",
        package_dir=tmp_path / "packages",
        allowed_origins=(ORIGIN,),
        session_ttl_seconds=3600,
        request_limit_per_minute=request_limit,
    )
    app = create_app(settings)
    now = [datetime(2026, 9, 21, 10, 0, tzinfo=timezone.utc)]
    app.state.now = lambda: now[0]
    base_url = "https://testserver" if production else "http://testserver"
    return TestClient(app, base_url=base_url), settings, now


def create_account(client, email, password="correct-horse-battery"):
    return client.post(
        "/v1/accounts",
        headers={"Origin": ORIGIN},
        json={"email": email, "password": password},
    )


def login(client, email, password="correct-horse-battery"):
    return client.post(
        "/v1/sessions",
        headers={"Origin": ORIGIN},
        json={"email": email, "password": password},
    )


def test_health_and_initial_catalog_are_minimal_and_empty(tmp_path):
    client, _, _ = make_client(tmp_path)
    assert client.get("/health").json() == {"status": "ok"}
    response = client.get("/v1/catalog")
    assert response.status_code == 200
    assert response.json() == {"items": []}
    assert "database" not in response.text.lower()


def test_two_server_accounts_are_isolated_and_passwords_are_argon2id(tmp_path):
    client, settings, _ = make_client(tmp_path)
    first = create_account(client, "alpha@example.com")
    second = create_account(client, "beta@example.com")
    assert first.status_code == second.status_code == 201
    assert first.json()["id"] != second.json()["id"]

    first_login = login(client, "alpha@example.com")
    assert first_login.status_code == 201
    assert client.get("/v1/me").json()["email"] == "alpha@example.com"

    with Database(settings.database_path, settings.database_url, settings.database_schema).connect() as db:
        rows = db.execute("SELECT email, password_hash FROM accounts ORDER BY email").fetchall()
    assert [row[0] for row in rows] == ["alpha@example.com", "beta@example.com"]
    assert all(row[1].startswith("$argon2id$") for row in rows)
    assert all("correct-horse-battery" not in row[1] for row in rows)


def test_wrong_secret_is_uniform_and_does_not_create_session(tmp_path):
    client, settings, _ = make_client(tmp_path)
    create_account(client, "alpha@example.com")
    wrong = login(client, "alpha@example.com", "definitely-wrong")
    unknown = login(client, "missing@example.com", "definitely-wrong")
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json() == {
        "code": "invalid_credentials",
        "message": "Authentication failed",
    }
    with Database(settings.database_path, settings.database_url, settings.database_schema).connect() as db:
        assert db.execute("SELECT count(*) FROM sessions").fetchone()[0] == 0


def test_session_token_is_hashed_expires_and_can_be_revoked(tmp_path):
    client, settings, now = make_client(tmp_path)
    create_account(client, "alpha@example.com")
    session = login(client, "alpha@example.com")
    token = client.cookies.get("dowze_session")
    csrf = session.json()["csrf_token"]
    assert token and csrf

    with Database(settings.database_path, settings.database_url, settings.database_schema).connect() as db:
        stored = db.execute("SELECT token_hash FROM sessions").fetchone()[0]
    assert token not in stored
    assert len(stored) == 64

    revoked = client.delete(
        "/v1/sessions",
        headers={"Origin": ORIGIN, "X-CSRF-Token": csrf},
    )
    assert revoked.status_code == 204
    assert client.get("/v1/me").status_code == 401

    session = login(client, "alpha@example.com")
    assert session.status_code == 201
    now[0] += timedelta(seconds=3601)
    assert client.get("/v1/me").status_code == 401


def test_origin_and_csrf_are_required_and_cookie_flags_follow_environment(tmp_path):
    client, _, _ = make_client(tmp_path, production=True)
    no_origin = client.post(
        "/v1/accounts",
        json={"email": "alpha@example.com", "password": "correct-horse-battery"},
    )
    assert no_origin.status_code == 403
    assert create_account(client, "alpha@example.com").status_code == 201
    session = login(client, "alpha@example.com")
    cookie = session.headers["set-cookie"].lower()
    assert "httponly" in cookie
    assert "samesite=strict" in cookie
    assert "secure" in cookie

    without_csrf = client.delete("/v1/sessions", headers={"Origin": ORIGIN})
    assert without_csrf.status_code == 403
    assert client.get("/v1/me").status_code == 200

    preflight = client.options(
        "/v1/sessions",
        headers={
            "Origin": ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,x-csrf-token",
        },
    )
    assert preflight.status_code == 200
    assert preflight.headers["access-control-allow-origin"] == ORIGIN
    assert preflight.headers["access-control-allow-credentials"] == "true"


def test_validation_and_database_errors_do_not_leak_internals(tmp_path):
    client, _, _ = make_client(tmp_path)
    response = create_account(client, "not-an-email", "short")
    assert response.status_code == 400
    text = response.text.lower()
    assert "sqlite" not in text
    assert str(tmp_path).lower() not in text
    assert set(response.json()) == {"code", "message"}


def test_request_body_and_rate_limits_return_bounded_errors(tmp_path):
    client, _, _ = make_client(tmp_path, request_limit=1)
    assert client.get("/health").status_code == 200
    limited = client.get("/health")
    assert limited.status_code == 429
    assert limited.headers["retry-after"] == "60"
    assert limited.json() == {"code": "rate_limited", "message": "Too many requests"}

    other_client, _, _ = make_client(tmp_path / "body")
    oversized = other_client.post(
        "/v1/accounts",
        headers={"Origin": ORIGIN, "Content-Length": "20000"},
        content=b"{}",
    )
    assert oversized.status_code == 413
    assert oversized.json() == {
        "code": "request_too_large",
        "message": "Request body too large",
    }

    request = other_client.build_request(
        "POST",
        "/v1/accounts",
        headers={"Origin": ORIGIN},
        content=b"x" * 20_000,
    )
    del request.headers["content-length"]
    streamed = other_client.send(request)
    assert streamed.status_code == 413
