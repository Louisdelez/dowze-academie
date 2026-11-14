from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
from urllib.parse import urlsplit


@dataclass(frozen=True)
class Settings:
    environment: str
    database_path: Path
    package_dir: Path
    allowed_origins: tuple[str, ...]
    database_url: str | None = None
    database_schema: str = "dowze_academie"
    blob_dir: Path | None = None
    session_ttl_seconds: int = 86_400
    request_limit_per_minute: int = 60
    sync_request_limit_per_minute: int = 1200
    max_request_bytes: int = 16_384
    sync_account_quota_bytes: int = 268_435_456
    sync_max_document_bytes: int = 1_048_576
    sync_max_blob_bytes: int = 16_777_216

    def __post_init__(self) -> None:
        if self.blob_dir is None:
            object.__setattr__(self, "blob_dir", self.package_dir.parent / "blobs")
        if self.environment not in {"development", "test", "production"}:
            raise ValueError("DOWZE_ENV must be development, test, or production")
        if not 300 <= self.session_ttl_seconds <= 2_592_000:
            raise ValueError("session TTL is outside the supported range")
        if not 1 <= self.request_limit_per_minute <= 10_000:
            raise ValueError("request limit is outside the supported range")
        if not 60 <= self.sync_request_limit_per_minute <= 10_000:
            raise ValueError("sync request limit is outside the supported range")
        if not 1_024 <= self.max_request_bytes <= 33_554_432:
            raise ValueError("request body limit is outside the supported range")
        if not 1 <= self.sync_max_document_bytes <= 4_194_304:
            raise ValueError("document size limit is outside the supported range")
        if not 1 <= self.sync_max_blob_bytes <= 33_554_432:
            raise ValueError("blob size limit is outside the supported range")
        if not 1 <= self.sync_account_quota_bytes <= 10_737_418_240:
            raise ValueError("account quota is outside the supported range")

        if not self.allowed_origins or len(self.allowed_origins) > 20:
            raise ValueError("allowed origins must contain between 1 and 20 entries")
        for origin in self.allowed_origins:
            parsed = urlsplit(origin)
            if (
                parsed.scheme not in {"http", "https"}
                or not parsed.netloc
                or parsed.path not in {"", "/"}
                or parsed.query
                or parsed.fragment
                or "*" in origin
            ):
                raise ValueError("allowed origins must be exact HTTP(S) origins")
            if self.environment == "production" and parsed.scheme != "https":
                raise ValueError("production origins must use HTTPS")

    @property
    def secure_cookies(self) -> bool:
        return self.environment == "production"

    @classmethod
    def from_env(cls) -> "Settings":
        environment = os.getenv("DOWZE_ENV", "development")
        origins = tuple(
            value.strip()
            for value in os.getenv("DOWZE_ALLOWED_ORIGINS", "http://127.0.0.1:4173").split(",")
            if value.strip()
        )
        if not origins:
            raise ValueError("DOWZE_ALLOWED_ORIGINS must not be empty")
        database_url = os.getenv("DOWZE_DATABASE_URL") or None
        database_url_file = os.getenv("DOWZE_DATABASE_URL_FILE")
        if database_url_file:
            database_url = Path(database_url_file).read_text(encoding="utf-8").strip()
            if not database_url:
                raise ValueError("database connection file is empty")
        if database_url and not database_url.startswith(("postgresql://", "postgres://")):
            raise ValueError("unsupported database connection")
        return cls(
            database_url=database_url,
            database_schema=os.getenv("DOWZE_DATABASE_SCHEMA", "dowze_academie"),
            environment=environment,
            database_path=Path(os.getenv("DOWZE_DATABASE_PATH", "data/api.sqlite3")),
            package_dir=Path(os.getenv("DOWZE_PACKAGE_DIR", "packages")),
            blob_dir=Path(os.getenv("DOWZE_BLOB_DIR", "data/blobs")),
            allowed_origins=origins,
            session_ttl_seconds=int(os.getenv("DOWZE_SESSION_TTL_SECONDS", "86400")),
            request_limit_per_minute=int(os.getenv("DOWZE_REQUEST_LIMIT_PER_MINUTE", "60")),
            sync_request_limit_per_minute=int(os.getenv("DOWZE_SYNC_REQUEST_LIMIT_PER_MINUTE", "1200")),
            max_request_bytes=int(os.getenv("DOWZE_MAX_REQUEST_BYTES", "16384")),
            sync_account_quota_bytes=int(os.getenv("DOWZE_SYNC_ACCOUNT_QUOTA_BYTES", "268435456")),
            sync_max_document_bytes=int(os.getenv("DOWZE_SYNC_MAX_DOCUMENT_BYTES", "1048576")),
            sync_max_blob_bytes=int(os.getenv("DOWZE_SYNC_MAX_BLOB_BYTES", "16777216")),
        )
