from __future__ import annotations

import sqlite3

import pytest

from app.db import Database
from app.manage import backup_database


def test_online_backup_is_a_readable_consistent_sqlite_copy(tmp_path):
    source = tmp_path / "source.sqlite3"
    destination = tmp_path / "backups" / "snapshot.sqlite3"
    db = Database(source)
    db.initialize()
    with db.transaction() as connection:
        connection.execute(
            "INSERT INTO accounts (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
            ("synthetic-id", "backup@example.com", "$argon2id$synthetic", "2026-09-21T10:00:00+00:00"),
        )

    backup_database(source, destination)

    with sqlite3.connect(destination) as backup:
        assert backup.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        assert backup.execute("SELECT email FROM accounts").fetchone()[0] == "backup@example.com"


def test_backup_refuses_to_replace_the_live_database(tmp_path):
    source = tmp_path / "source.sqlite3"
    Database(source).initialize()
    with pytest.raises(ValueError, match="must differ"):
        backup_database(source, source)
