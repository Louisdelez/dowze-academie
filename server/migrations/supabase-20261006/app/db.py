from __future__ import annotations

from contextlib import contextmanager
import json
from pathlib import Path
import secrets
import sqlite3
from typing import Iterator
import re

try:
    import psycopg
except ImportError:
    psycopg = None

IntegrityError = (sqlite3.IntegrityError,) + ((psycopg.IntegrityError,) if psycopg else ())


SCHEMA = """
CREATE TABLE IF NOT EXISTS app_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    csrf_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS sessions_account_id ON sessions(account_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS catalog_packages (
    formation_id TEXT NOT NULL,
    version TEXT NOT NULL,
    title TEXT NOT NULL,
    package_size INTEGER NOT NULL CHECK(package_size > 0),
    package_sha256 TEXT NOT NULL,
    manifest_json TEXT NOT NULL,
    stored_path TEXT NOT NULL UNIQUE,
    published_at TEXT NOT NULL,
    PRIMARY KEY (formation_id, version)
);
CREATE TABLE IF NOT EXISTS annual_spaces (
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    formation_id TEXT NOT NULL,
    academic_year TEXT NOT NULL,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (account_id, id)
);
CREATE TABLE IF NOT EXISTS sync_documents (
    account_id TEXT NOT NULL,
    space_id TEXT NOT NULL,
    document_type TEXT NOT NULL,
    document_id TEXT NOT NULL,
    version INTEGER NOT NULL CHECK(version > 0),
    content_json TEXT,
    content_bytes INTEGER NOT NULL CHECK(content_bytes >= 0),
    deleted INTEGER NOT NULL CHECK(deleted IN (0, 1)),
    updated_at TEXT NOT NULL,
    PRIMARY KEY (account_id, space_id, document_type, document_id),
    FOREIGN KEY (account_id, space_id) REFERENCES annual_spaces(account_id, id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS sync_changes (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL,
    space_id TEXT NOT NULL,
    document_type TEXT NOT NULL,
    document_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    content_json TEXT,
    deleted INTEGER NOT NULL CHECK(deleted IN (0, 1)),
    changed_at TEXT NOT NULL,
    FOREIGN KEY (account_id, space_id) REFERENCES annual_spaces(account_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS sync_changes_scope ON sync_changes(account_id, space_id, sequence);
CREATE TABLE IF NOT EXISTS sync_idempotency (
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    idempotency_key TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    status_code INTEGER NOT NULL,
    response_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (account_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS sync_blobs (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    space_id TEXT NOT NULL,
    stored_name TEXT NOT NULL UNIQUE,
    media_type TEXT NOT NULL,
    size INTEGER NOT NULL CHECK(size > 0),
    sha256 TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (account_id, space_id) REFERENCES annual_spaces(account_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS sync_blobs_owner ON sync_blobs(account_id, space_id);
CREATE TABLE IF NOT EXISTS sync_blob_refs (
    blob_id TEXT NOT NULL REFERENCES sync_blobs(id) ON DELETE RESTRICT,
    account_id TEXT NOT NULL,
    space_id TEXT NOT NULL,
    document_type TEXT NOT NULL,
    document_id TEXT NOT NULL,
    PRIMARY KEY (blob_id, account_id, space_id, document_type, document_id),
    FOREIGN KEY (account_id, space_id, document_type, document_id)
      REFERENCES sync_documents(account_id, space_id, document_type, document_id) ON DELETE CASCADE
);
"""


TABLES = ("app_metadata", "accounts", "sessions", "catalog_packages", "annual_spaces", "sync_documents", "sync_changes", "sync_idempotency", "sync_blobs", "sync_blob_refs")
POSTGRES_SCHEMA = SCHEMA.replace(" UNIQUE COLLATE NOCASE", " UNIQUE").replace("INTEGER PRIMARY KEY AUTOINCREMENT", "BIGSERIAL PRIMARY KEY").replace("INTEGER", "BIGINT") + "CREATE UNIQUE INDEX IF NOT EXISTS accounts_email_lower ON accounts(lower(email));"
WRITE_LOCK = 67374102512026


class CompatibleRow(dict):
    def __getitem__(self, key):
        return list(self.values())[key] if isinstance(key, int) else super().__getitem__(key)


def compatible_rows(cursor):
    names = [column.name for column in cursor.description] if cursor.description else []
    return lambda values: CompatibleRow(zip(names, values))


def postgres_query(query, parameters):
    # Only source-owned SQL passes here; user values remain separately bound.
    query = query.replace("length(CAST(content_json AS BLOB))", "octet_length(content_json)")
    result, quote, index = [], None, 0
    while index < len(query):
        char = query[index]
        if quote:
            result.append("%%" if char == "%" and parameters is not None else char)
            if char == quote:
                if index + 1 < len(query) and query[index + 1] == quote:
                    result.append(quote); index += 1
                else: quote = None
        elif char in ("'", '"'):
            quote = char; result.append(char)
        elif char == "?": result.append("%s")
        elif char == "%" and parameters is not None: result.append("%%")
        else: result.append(char)
        index += 1
    return "".join(result)


class PostgresConnection:
    def __init__(self, dsn, schema):
        self.raw = psycopg.connect(dsn, row_factory=compatible_rows, connect_timeout=5,
            options=f"-c search_path={schema},pg_catalog -c statement_timeout=30000 -c lock_timeout=10000")

    def execute(self, query, parameters=None):
        return self.raw.execute(postgres_query(query, parameters), parameters)

    def commit(self): self.raw.commit()
    def rollback(self): self.raw.rollback()
    def close(self): self.raw.close()
    def __enter__(self): return self
    def __exit__(self, kind, value, traceback):
        try:
            if kind: self.rollback()
            else: self.commit()
        finally: self.close()


class Database:
    def __init__(self, path: Path, database_url: str | None = None, schema: str = "dowze_academie"):
        self.path = Path(path)
        self.database_url = database_url
        self.schema = schema
        self.backend = "postgresql" if database_url else "sqlite"
        if not re.fullmatch(r"[a-z][a-z0-9_]{0,62}", schema):
            raise ValueError("invalid database schema")
        if database_url and psycopg is None:
            raise RuntimeError("PostgreSQL driver unavailable; refusing SQLite fallback")

    def connect(self) -> sqlite3.Connection:
        if self.database_url:
            return PostgresConnection(self.database_url, self.schema)
        connection = sqlite3.connect(self.path, timeout=5.0)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 5000")
        return connection

    def initialize(self) -> None:
        if self.database_url:
            # The runtime cannot create or alter tables. Provisioning is explicit.
            self.cursor_secret()
            return
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as connection:
            connection.execute("PRAGMA journal_mode = WAL")
            connection.execute("PRAGMA synchronous = FULL")
            connection.executescript(SCHEMA)
            connection.execute(
                "INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('cursor_secret', ?)",
                (secrets.token_hex(32),),
            )

    def cursor_secret(self) -> bytes:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT value FROM app_metadata WHERE key = 'cursor_secret'"
            ).fetchone()
        if row is None:
            raise RuntimeError("cursor secret unavailable")
        return bytes.fromhex(row["value"])

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        connection = self.connect()
        try:
            if self.database_url:
                connection.execute("SELECT pg_advisory_xact_lock(?)", (WRITE_LOCK,))
            else:
                connection.execute("BEGIN IMMEDIATE")
            yield connection
            connection.commit()
        except BaseException:
            connection.rollback()
            raise
        finally:
            connection.close()

    def list_catalog(self) -> list[dict]:
        with self.connect() as connection:
            rows = connection.execute(
                "SELECT formation_id, version, title, package_size, package_sha256 "
                "FROM catalog_packages ORDER BY formation_id, version"
            ).fetchall()
        return [dict(row) for row in rows]

    def get_package(self, formation_id: str, version: str) -> dict | None:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT * FROM catalog_packages WHERE formation_id = ? AND version = ?",
                (formation_id, version),
            ).fetchone()
        if row is None:
            return None
        result = dict(row)
        result["manifest"] = json.loads(result.pop("manifest_json"))
        return result

    def snapshot(self, destination: Path, transaction=None) -> None:
        """Portable recovery artifact; PostgreSQL remains the live database."""
        from contextlib import closing
        if not self.database_url:
            with closing(sqlite3.connect(self.path)) as source, closing(sqlite3.connect(destination)) as target:
                source.backup(target)
                if target.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                    raise RuntimeError("snapshot integrity check failed")
            return
        if transaction is None:
            with self.transaction() as connection:
                self.snapshot(destination, connection)
            return
        with closing(sqlite3.connect(destination)) as target:
            target.execute("PRAGMA foreign_keys = ON")
            target.executescript(SCHEMA)
            for table in TABLES:
                cursor = transaction.execute(f'SELECT * FROM "{table}"')
                columns = [column.name for column in cursor.description]
                fields = ",".join('"'+column+'"' for column in columns)
                placeholders = ",".join("?" for _ in columns)
                while rows := cursor.fetchmany(1000):
                    target.executemany(f'INSERT INTO "{table}" ({fields}) VALUES ({placeholders})',
                        [tuple(row[column] for column in columns) for row in rows])
            sequence = transaction.execute("SELECT last_value, is_called FROM sync_changes_sequence_seq").fetchone()
            value = sequence["last_value"] if sequence["is_called"] else 0
            target.execute("DELETE FROM sqlite_sequence WHERE name='sync_changes'")
            target.execute("INSERT INTO sqlite_sequence(name,seq) VALUES ('sync_changes',?)", (value,))
            target.commit()
            if target.execute("PRAGMA integrity_check").fetchone()[0] != "ok" or target.execute("PRAGMA foreign_key_check").fetchall():
                raise RuntimeError("snapshot integrity check failed")
