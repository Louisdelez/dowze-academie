from __future__ import annotations

from collections import OrderedDict, deque
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import secrets
import sqlite3
import threading
from uuid import uuid4

from argon2 import PasswordHasher, Type
from argon2.exceptions import InvalidHashError, VerifyMismatchError

from .db import Database, IntegrityError

PASSWORD_HASHER = PasswordHasher(
    time_cost=3,
    memory_cost=65_536,
    parallelism=2,
    hash_len=32,
    salt_len=16,
    type=Type.ID,
)
DUMMY_HASH = PASSWORD_HASHER.hash("not-a-real-user-password")


def token_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def create_account(db: Database, email: str, password: str, now: datetime) -> dict:
    account = {
        "id": str(uuid4()),
        "email": email.strip().lower(),
        "created_at": now.astimezone(timezone.utc).isoformat(),
    }
    password_hash = PASSWORD_HASHER.hash(password)
    try:
        with db.transaction() as connection:
            connection.execute(
                "INSERT INTO accounts (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
                (account["id"], account["email"], password_hash, account["created_at"]),
            )
    except IntegrityError as error:
        raise AccountExists from error
    return account


class AccountExists(Exception):
    pass


def authenticate(db: Database, email: str, password: str) -> dict | None:
    with db.connect() as connection:
        row = connection.execute(
            "SELECT id, email, password_hash, created_at FROM accounts WHERE lower(email) = lower(?)",
            (email.strip().lower(),),
        ).fetchone()
    encoded = row["password_hash"] if row else DUMMY_HASH
    try:
        valid = PASSWORD_HASHER.verify(encoded, password)
    except (VerifyMismatchError, InvalidHashError):
        valid = False
    if not valid or row is None:
        return None
    return {"id": row["id"], "email": row["email"], "created_at": row["created_at"]}


def create_session(db: Database, account_id: str, now: datetime, ttl_seconds: int) -> dict:
    token = secrets.token_urlsafe(48)
    csrf = secrets.token_urlsafe(32)
    expires_at = now + timedelta(seconds=ttl_seconds)
    with db.transaction() as connection:
        connection.execute(
            "INSERT INTO sessions (id, account_id, token_hash, csrf_hash, created_at, expires_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (
                str(uuid4()),
                account_id,
                token_hash(token),
                token_hash(csrf),
                now.astimezone(timezone.utc).isoformat(),
                expires_at.astimezone(timezone.utc).isoformat(),
            ),
        )
    return {"token": token, "csrf_token": csrf, "expires_at": expires_at.astimezone(timezone.utc).isoformat()}


def get_session(db: Database, token: str | None, now: datetime) -> dict | None:
    if not token:
        return None
    digest = token_hash(token)
    with db.connect() as connection:
        row = connection.execute(
            "SELECT s.id AS session_id, s.csrf_hash, s.expires_at, s.revoked_at, "
            "a.id, a.email, a.created_at FROM sessions s "
            "JOIN accounts a ON a.id = s.account_id WHERE s.token_hash = ?",
            (digest,),
        ).fetchone()
    if row is None or row["revoked_at"] is not None:
        return None
    if datetime.fromisoformat(row["expires_at"]) <= now:
        return None
    return dict(row)


def verify_csrf(session: dict, csrf: str | None) -> bool:
    return bool(csrf) and hmac.compare_digest(session["csrf_hash"], token_hash(csrf))


def rotate_csrf(db: Database, session_id: str) -> str:
    csrf = secrets.token_urlsafe(32)
    with db.transaction() as connection:
        updated = connection.execute(
            "UPDATE sessions SET csrf_hash = ? WHERE id = ? AND revoked_at IS NULL",
            (token_hash(csrf), session_id),
        ).rowcount
        if updated != 1:
            raise RuntimeError("session unavailable")
    return csrf


def revoke_session(db: Database, session_id: str, now: datetime) -> None:
    with db.transaction() as connection:
        connection.execute(
            "UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL",
            (now.astimezone(timezone.utc).isoformat(), session_id),
        )


@dataclass
class FixedWindowLimiter:
    limit: int
    max_keys: int = 10_000

    def __post_init__(self) -> None:
        self._events: OrderedDict[str, deque[float]] = OrderedDict()
        self._lock = threading.Lock()

    def accept(self, key: str, timestamp: float) -> bool:
        cutoff = timestamp - 60.0
        with self._lock:
            events = self._events.get(key)
            if events is None:
                if len(self._events) >= self.max_keys:
                    self._events.popitem(last=False)
                events = deque()
                self._events[key] = events
            else:
                self._events.move_to_end(key)
            while events and events[0] <= cutoff:
                events.popleft()
            if len(events) >= self.limit:
                return False
            events.append(timestamp)
            return True
