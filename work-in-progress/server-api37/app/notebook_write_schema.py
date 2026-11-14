"""Private candidate migration only; production provisioning is not automatic."""
NOTEBOOK_WRITE_TABLES = ("notebook_uploads", "notebook_versions", "notebook_version_blobs")
NOTEBOOK_WRITE_SCHEMA = """
CREATE TABLE IF NOT EXISTS notebook_uploads (
    blob_id TEXT PRIMARY KEY REFERENCES sync_blobs(id) ON DELETE RESTRICT,
    resource_id TEXT NOT NULL REFERENCES notebook_resources(id) ON DELETE RESTRICT,
    actor_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    incarnation TEXT NOT NULL,
    resource_version INTEGER NOT NULL CHECK(resource_version > 0),
    writer_version INTEGER NOT NULL CHECK(writer_version > 0),
    receipt_key TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    published_at TEXT,
    UNIQUE(actor_account_id,receipt_key)
);
CREATE INDEX IF NOT EXISTS notebook_uploads_resource ON notebook_uploads(resource_id,blob_id);
CREATE TABLE IF NOT EXISTS notebook_versions (
    resource_id TEXT NOT NULL REFERENCES notebook_resources(id) ON DELETE RESTRICT,
    canonical_version INTEGER NOT NULL CHECK(canonical_version > 0),
    metadata_version INTEGER NOT NULL CHECK(metadata_version > 0),
    canonical_sha256 TEXT NOT NULL,
    metadata_sha256 TEXT NOT NULL,
    manifest_json TEXT NOT NULL,
    actor_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    created_at TEXT NOT NULL,
    PRIMARY KEY(resource_id,canonical_version,metadata_version)
);
CREATE TABLE IF NOT EXISTS notebook_version_blobs (
    resource_id TEXT NOT NULL,
    canonical_version INTEGER NOT NULL,
    metadata_version INTEGER NOT NULL,
    blob_id TEXT NOT NULL REFERENCES sync_blobs(id) ON DELETE RESTRICT,
    PRIMARY KEY(resource_id,canonical_version,metadata_version,blob_id),
    FOREIGN KEY(resource_id,canonical_version,metadata_version)
      REFERENCES notebook_versions(resource_id,canonical_version,metadata_version) ON DELETE RESTRICT
);
"""
