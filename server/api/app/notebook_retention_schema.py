"""Private candidate retention, never automatically provisioned on PostgreSQL."""
NOTEBOOK_RETENTION_TABLES = ("notebook_version_sources",)
NOTEBOOK_RETENTION_SCHEMA = """
CREATE TABLE IF NOT EXISTS notebook_version_sources (
    resource_id TEXT NOT NULL,
    canonical_version INTEGER NOT NULL,
    metadata_version INTEGER NOT NULL,
    canonical_source_json TEXT NOT NULL,
    metadata_source_json TEXT NOT NULL,
    canonical_source_bytes INTEGER NOT NULL CHECK(canonical_source_bytes > 0),
    metadata_source_bytes INTEGER NOT NULL CHECK(metadata_source_bytes > 0),
    canonical_source_sha256 TEXT NOT NULL,
    metadata_source_sha256 TEXT NOT NULL,
    canonical_codec TEXT NOT NULL CHECK(canonical_codec IN ('inline','gzip')),
    body_id TEXT REFERENCES sync_blobs(id) ON DELETE RESTRICT,
    captured_at TEXT NOT NULL,
    PRIMARY KEY(resource_id,canonical_version,metadata_version),
    FOREIGN KEY(resource_id,canonical_version,metadata_version)
      REFERENCES notebook_versions(resource_id,canonical_version,metadata_version) ON DELETE RESTRICT,
    CHECK((canonical_codec='inline' AND body_id IS NULL) OR (canonical_codec='gzip' AND body_id IS NOT NULL))
);
"""
