"""Isolated candidate schema. PostgreSQL provisioning remains an explicit later step."""

NOTEBOOK_TABLES = ("notebook_resources", "notebook_grants", "notebook_invitations", "notebook_receipts")

NOTEBOOK_SCHEMA = """
CREATE TABLE IF NOT EXISTS notebook_resources (
    id TEXT PRIMARY KEY,
    incarnation TEXT NOT NULL UNIQUE,
    owner_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    space_id TEXT NOT NULL,
    note_id TEXT NOT NULL,
    canonical_document_id TEXT NOT NULL,
    metadata_document_id TEXT NOT NULL,
    lineage TEXT NOT NULL,
    state TEXT NOT NULL CHECK(state IN ('active','trashed','purged')),
    resource_version INTEGER NOT NULL CHECK(resource_version > 0),
    acl_version INTEGER NOT NULL CHECK(acl_version > 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(owner_account_id,space_id,canonical_document_id),
    UNIQUE(owner_account_id,space_id,metadata_document_id),
    UNIQUE(owner_account_id,space_id,note_id),
    FOREIGN KEY(owner_account_id,space_id) REFERENCES annual_spaces(account_id,id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS notebook_grants (
    resource_id TEXT NOT NULL REFERENCES notebook_resources(id) ON DELETE RESTRICT,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    role TEXT NOT NULL CHECK(role IN ('viewer','commenter','editor')),
    version INTEGER NOT NULL CHECK(version > 0),
    source_invitation_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    revoked_at TEXT,
    PRIMARY KEY(resource_id,account_id)
);
CREATE TABLE IF NOT EXISTS notebook_invitations (
    id TEXT PRIMARY KEY,
    resource_id TEXT NOT NULL REFERENCES notebook_resources(id) ON DELETE RESTRICT,
    recipient_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    role TEXT NOT NULL CHECK(role IN ('viewer','commenter','editor')),
    state TEXT NOT NULL CHECK(state IN ('pending','accepted','revoked')),
    version INTEGER NOT NULL CHECK(version > 0),
    accepted_grant_version INTEGER,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS notebook_invitations_recipient ON notebook_invitations(recipient_account_id,id);
CREATE TABLE IF NOT EXISTS notebook_receipts (
    actor_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    idempotency_key TEXT NOT NULL,
    resource_id TEXT NOT NULL REFERENCES notebook_resources(id) ON DELETE RESTRICT,
    request_hash TEXT NOT NULL,
    status_code INTEGER NOT NULL,
    response_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY(actor_account_id,idempotency_key)
);
"""
