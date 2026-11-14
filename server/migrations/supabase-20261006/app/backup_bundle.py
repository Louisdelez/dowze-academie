"""Consistent private snapshot of SQLite and its referenced files; restore to a new directory only."""
from __future__ import annotations

from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import tempfile

from .db import Database

SHA256 = re.compile(r'^[a-f0-9]{64}$')
MAX_FILE = 50 * 1024 * 1024


def copy_checked(source, destination, size, digest, *, maximum=MAX_FILE):
    source, destination = Path(source), Path(destination)
    if not isinstance(size, int) or isinstance(size, bool) or not 0 < size <= maximum:
        raise ValueError('invalid file size')
    if not isinstance(digest, str) or not SHA256.fullmatch(digest):
        raise ValueError('invalid file digest')
    if source.is_symlink() or not source.is_file() or source.stat().st_size != size:
        raise ValueError('backup source is not the expected regular file')
    total = 0
    checksum = hashlib.sha256()
    with source.open('rb') as incoming, destination.open('xb') as outgoing:
        os.chmod(destination, 0o600)
        while True:
            chunk = incoming.read(min(1024 * 1024, size + 1 - total))
            if not chunk:
                break
            total += len(chunk)
            if total > size:
                raise ValueError('file changed during backup')
            checksum.update(chunk)
            outgoing.write(chunk)
        outgoing.flush()
        os.fsync(outgoing.fileno())
    if total != size or checksum.hexdigest() != digest:
        raise ValueError('file integrity mismatch')


def fingerprint(path):
    digest = hashlib.sha256()
    size = 0
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            size += len(chunk)
            digest.update(chunk)
    return {'size': size, 'sha256': digest.hexdigest()}


def _references(connection):
    refs = []
    for row in connection.execute('SELECT stored_name, size, sha256 FROM sync_blobs'):
        refs.append(('blobs', row[0], row[1], row[2]))
    for row in connection.execute('SELECT stored_path, package_size, package_sha256 FROM catalog_packages'):
        refs.append(('packages', row[0], row[1], row[2]))
    for group, name, size, digest in refs:
        if not isinstance(name, str) or name in ('', '.', '..') or '/' in name or '\\' in name or ':' in name:
            raise ValueError('invalid stored filename')
    return refs


def create_bundle(settings, destination):
    destination = Path(destination)
    if destination.exists():
        raise FileExistsError('backup destination already exists')
    if not settings.database_url and not settings.database_path.is_file():
        raise FileNotFoundError('source database does not exist')
    destination.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix='.dowze-backup-', dir=destination.parent))
    try:
        manifest = {'schema': 'dowze-backup@1', 'files': {}}
        for group in ('blobs', 'packages'):
            (staging / group).mkdir(mode=0o700)
        db = Database(settings.database_path, settings.database_url, settings.database_schema)
        # This same write lock protects publication, upload, deletion, and startup reconciliation.
        with db.transaction() as transaction:
            refs = _references(transaction)
            snapshot = staging / 'api.sqlite3'
            db.snapshot(snapshot, transaction)
            os.chmod(snapshot, 0o600)
            manifest['files']['api.sqlite3'] = fingerprint(snapshot)
            if manifest['files']['api.sqlite3']['size'] > 8 * 1024**3:
                raise ValueError('database exceeds supported backup size')
            for group, name, size, digest in refs:
                root = settings.blob_dir if group == 'blobs' else settings.package_dir
                path = Path(root) / name
                if path.resolve().parent != Path(root).resolve():
                    raise ValueError('file escaped managed directory')
                copy_checked(path, staging / group / name, size, digest)
                manifest['files'][f'{group}/{name}'] = {'size': size, 'sha256': digest}
        manifest_path = staging / 'manifest.json'
        manifest_path.write_text(json.dumps(manifest, sort_keys=True, indent=2), encoding='utf-8')
        os.chmod(manifest_path, 0o600)
        # Only a complete snapshot becomes visible. Never replace an existing directory.
        if destination.exists():
            raise FileExistsError('backup destination already exists')
        staging.rename(destination)
        return manifest
    finally:
        if staging.exists():
            shutil.rmtree(staging)


def restore_bundle(source, destination):
    source, destination = Path(source), Path(destination)
    if destination.exists():
        raise FileExistsError('restore destination already exists')
    if source.is_symlink() or not source.is_dir():
        raise ValueError('backup must be a regular directory')
    manifest_path = source / 'manifest.json'
    if manifest_path.is_symlink() or manifest_path.stat().st_size > 64 * 1024 * 1024:
        raise ValueError('invalid backup manifest')
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    if manifest.get('schema') != 'dowze-backup@1' or not isinstance(manifest.get('files'), dict):
        raise ValueError('unknown backup format')
    files = manifest['files']
    if 'api.sqlite3' not in files or len(files) > 100_000:
        raise ValueError('invalid backup file list')
    destination.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix='.dowze-restore-', dir=destination.parent))
    try:
        for group in ('blobs', 'packages'):
            (staging / group).mkdir(mode=0o700)
        for name, metadata in files.items():
            parts = name.split('/')
            if name != 'api.sqlite3' and (len(parts) != 2 or parts[0] not in ('blobs', 'packages')):
                raise ValueError('unsafe backup path')
            if any(part in ('', '.', '..') or '\\' in part or ':' in part for part in parts):
                raise ValueError('unsafe backup path')
            if len(parts) == 2 and (source / parts[0]).is_symlink():
                raise ValueError('backup subdirectory is a symlink')
            path = source.joinpath(*parts)
            if path.resolve().parent != (source if name == 'api.sqlite3' else source / parts[0]).resolve():
                raise ValueError('backup path escaped')
            copy_checked(path, staging.joinpath(*parts), metadata['size'], metadata['sha256'], maximum=8 * 1024**3 if name == 'api.sqlite3' else MAX_FILE)
        with closing(sqlite3.connect(staging / 'api.sqlite3')) as restored:
            if restored.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                raise ValueError('restored database integrity check failed')
            expected = {'api.sqlite3'}
            for group, name, size, digest in _references(restored):
                key = f'{group}/{name}'
                expected.add(key)
                if files.get(key) != {'size': size, 'sha256': digest}:
                    raise ValueError('database and backup files disagree')
            if set(files) != expected:
                raise ValueError('backup file list does not match database')
        if destination.exists():
            raise FileExistsError('restore destination already exists')
        staging.rename(destination)
        return {'database': str(destination / 'api.sqlite3'), 'files': len(files)}
    finally:
        if staging.exists():
            shutil.rmtree(staging)
