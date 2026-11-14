from __future__ import annotations

import argparse
from contextlib import closing
import json
import os
from pathlib import Path
import sqlite3
import tempfile

from .backup_bundle import create_bundle, restore_bundle
from .catalog import publish_package
from .config import Settings
from .db import Database


def backup_database(source: Path, destination: Path) -> None:
    source = Path(source)
    destination = Path(destination)
    if not source.is_file():
        raise FileNotFoundError("source database does not exist")
    if source.resolve() == destination.resolve():
        raise ValueError("backup destination must differ from source database")
    destination.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary_name = tempfile.mkstemp(
        prefix=f".{destination.name}-", suffix=".tmp", dir=destination.parent
    )
    os.close(fd)
    temporary = Path(temporary_name)
    try:
        with closing(sqlite3.connect(source)) as source_db:
            with closing(sqlite3.connect(temporary)) as backup_db:
                source_db.backup(backup_db)
                result = backup_db.execute("PRAGMA integrity_check").fetchone()[0]
                if result != "ok":
                    raise RuntimeError("backup integrity check failed")
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Dowze NAS API local administration")
    subcommands = parser.add_subparsers(dest="command", required=True)

    publish = subcommands.add_parser("publish", help="validate and publish an immutable ZIP")
    publish.add_argument("source", type=Path)
    publish.add_argument("formation_id")
    publish.add_argument("version")
    publish.add_argument("title")
    publish.add_argument("--validation-report", type=Path, required=True, help="JSON result from validate-course-package.mjs for these exact files")

    backup = subcommands.add_parser("backup", help="create an online consistent SQLite backup")
    backup.add_argument("destination", type=Path)

    bundle = subcommands.add_parser("backup-bundle", help="snapshot SQLite and referenced files together")
    bundle.add_argument("destination", type=Path)
    restore = subcommands.add_parser("restore-bundle", help="restore into a new directory only")
    restore.add_argument("source", type=Path)
    restore.add_argument("destination", type=Path)
    args = parser.parse_args()
    if args.command == "restore-bundle":
        print(json.dumps(restore_bundle(args.source, args.destination)))
        return 0
    settings = Settings.from_env()
    db = Database(settings.database_path, settings.database_url, settings.database_schema)
    db.initialize()
    if args.command == "publish":
        with args.validation_report.open("rb") as report_file:
            raw = report_file.read(65_537)
        if len(raw) > 65_536:
            raise ValueError("validation report too large")
        report = json.loads(raw)
        if not isinstance(report, dict):
            raise ValueError("invalid validation report")
        manifest = publish_package(
            db,
            settings.package_dir,
            args.source,
            args.formation_id,
            args.version,
            args.title,
            validation_report=report,
        )
        print(json.dumps(manifest, indent=2, sort_keys=True))
    elif args.command == "backup-bundle":
        print(json.dumps(create_bundle(settings, args.destination)))
    else:
        if settings.database_url:
            db.snapshot(args.destination)
        else:
            backup_database(settings.database_path, args.destination)
        print(str(args.destination))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
