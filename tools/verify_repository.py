#!/usr/bin/env python3
"""Contrôles légers des sources consolidées ; aucun import applicatif ni build."""
import ast
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
SKIP = {'.git', 'node_modules', 'local', '__pycache__', 'target', 'dist', 'pwa-dist', '.venv'}


def files():
    def walk(directory):
        for path in sorted(directory.iterdir()):
            if path.name in SKIP or path.is_symlink():
                continue
            if path.is_dir():
                yield from walk(path)
            elif path.is_file():
                yield path
    return list(walk(ROOT))


def check():
    errors = []
    counts = {'json': 0, 'python': 0, 'sourcePins': 0, 'shell': 0}
    all_files = files()
    for path in all_files:
        relative = str(path.relative_to(ROOT))
        if relative == 'docs/verification.json':
            continue
        try:
            if path.suffix == '.json':
                json.loads(path.read_text())
                counts['json'] += 1
            if path.suffix == '.py':
                ast.parse(path.read_text(), filename=relative)
                counts['python'] += 1
            if path.suffix == '.sh':
                subprocess.run(['bash', '-n', str(path)], check=True, capture_output=True)
                counts['shell'] += 1
        except Exception as exc:
            errors.append({'path': relative, 'type': type(exc).__name__})
    version = json.loads((ROOT / 'package.json').read_text())['version']
    for path in ['package-lock.json', 'src-tauri/tauri.conf.json']:
        if json.loads((ROOT / path).read_text())['version'] != version:
            errors.append({'path': path, 'type': 'versionMismatch'})
    cargo = (ROOT / 'src-tauri/Cargo.toml').read_text()
    if f'version = "{version}"' not in cargo:
        errors.append({'path': 'src-tauri/Cargo.toml', 'type': 'versionMismatch'})
    manifest = json.loads((ROOT / 'docs/source-integrity.json').read_text())
    for entry in manifest['files']:
        path = ROOT / entry['path']
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != entry['sha256']:
            errors.append({'path': entry['path'], 'type': 'sourceHashMismatch'})
        counts['sourcePins'] += 1
    notes = json.loads((ROOT / 'work-in-progress/notes/manifest.json').read_text())
    if len(notes['changes']) != 53 or len(notes['expectedSourceFiles']) != 619 or notes['unresolvedSources']:
        errors.append({'path': 'work-in-progress/notes/manifest.json', 'type': 'incompleteNotesManifest'})
    report = {'date': '2026-11-14', 'scope': 'source-consolidation-only', 'status': 'pass' if not errors else 'fail', 'applicationVersion': version, 'filesInspected': len(all_files), 'checks': counts, 'errors': errors, 'notRun': ['application builds', 'functional suites', 'desktop GUI', 'production database inspection', 'physical Pencil/tablet tests']}
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return report


if __name__ == '__main__':
    sys.exit(0 if check()['status'] == 'pass' else 1)
