import pytest

from app.config import Settings


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("environment", "prodution"),
        ("session_ttl_seconds", 0),
        ("request_limit_per_minute", -1),
        ("max_request_bytes", 0),
    ],
)
def test_invalid_security_configuration_fails_closed(tmp_path, field, value):
    arguments = {
        "environment": "test",
        "database_path": tmp_path / "db.sqlite3",
        "package_dir": tmp_path / "packages",
        "allowed_origins": ("http://127.0.0.1:4173",),
    }
    arguments[field] = value
    with pytest.raises(ValueError):
        Settings(**arguments)


def test_production_rejects_non_https_origins(tmp_path):
    with pytest.raises(ValueError, match="HTTPS"):
        Settings(
            environment="production",
            database_path=tmp_path / "db.sqlite3",
            package_dir=tmp_path / "packages",
            allowed_origins=("http://127.0.0.1:4173",),
        )