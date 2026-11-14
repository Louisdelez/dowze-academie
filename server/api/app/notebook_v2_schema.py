"""Permanent v2 admission identities for the isolated SQLite candidate.

No runtime PostgreSQL DDL is performed. A lifecycle may retire a resource, not
forget and reuse its admission nonce or silently resurrect its original ACL.
"""
NOTEBOOK_V2_TABLES = ("notebook_admission_nonces",)
NOTEBOOK_V2_SCHEMA = """
CREATE TABLE IF NOT EXISTS notebook_admission_nonces (
    incarnation TEXT PRIMARY KEY,
    resource_id TEXT NOT NULL UNIQUE REFERENCES notebook_resources(id) ON DELETE RESTRICT,
    owner_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    packet_sha256 TEXT NOT NULL,
    created_at TEXT NOT NULL
);
"""
