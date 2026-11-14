"""New isolated schema only. No runtime PostgreSQL migration or physical purge."""

NOTEBOOK_LIFECYCLE_TABLES = ("notebook_trash_cycles",)
NOTEBOOK_LIFECYCLE_SCHEMA = """
CREATE TABLE IF NOT EXISTS notebook_trash_cycles (
    resource_id TEXT NOT NULL REFERENCES notebook_resources(id) ON DELETE RESTRICT,
    incarnation TEXT NOT NULL,
    trash_resource_version INTEGER NOT NULL CHECK(trash_resource_version > 0),
    source_canonical_version INTEGER NOT NULL CHECK(source_canonical_version > 0),
    source_metadata_version INTEGER NOT NULL CHECK(source_metadata_version > 0),
    canonical_tombstone_version INTEGER NOT NULL CHECK(canonical_tombstone_version > 0),
    metadata_tombstone_version INTEGER NOT NULL CHECK(metadata_tombstone_version > 0),
    canonical_source_sha256 TEXT NOT NULL,
    metadata_source_sha256 TEXT NOT NULL,
    manifest_sha256 TEXT NOT NULL,
    trashed_at TEXT NOT NULL,
    restore_until TEXT NOT NULL,
    restored_at TEXT,
    restored_resource_version INTEGER,
    restored_canonical_version INTEGER,
    restored_metadata_version INTEGER,
    PRIMARY KEY(resource_id,trash_resource_version),
    FOREIGN KEY(resource_id,source_canonical_version,source_metadata_version)
      REFERENCES notebook_version_sources(resource_id,canonical_version,metadata_version) ON DELETE RESTRICT
);
"""
