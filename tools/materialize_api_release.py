#!/usr/bin/env python3
"""Reconstituer le contexte scellé récupéré en production, sans exécuter ni déployer."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]


def materialize(destination):
    destination = Path(destination).resolve()
    if destination.exists() or destination == ROOT or ROOT in destination.parents:
        raise ValueError('La destination doit être inexistante et extérieure au dépôt')
    api = ROOT / 'server/api'
    runtime = api / 'runtime'
    manifest = json.loads((runtime / 'release.json').read_text())
    digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
    if digest(runtime / 'release.json') != (api / 'app/notebook_release.sha256').read_text().strip():
        raise ValueError('Scellement du manifeste incorrect')
    files = []
    for name, sha in manifest['app'].items():
        if Path(name).name != name:
            raise ValueError('Chemin de module interdit')
        path = api / 'app' / name
        if digest(path) != sha:
            raise ValueError('Module modifié : ' + name)
        files.append((path, 'app/' + name, 0o644))
    node = ROOT / 'local/runtime/notebook-validator/node'
    for key, source, name, mode in [
        ('node', node, 'node', 0o755),
        ('worker', runtime / 'worker.mjs', 'worker.mjs', 0o644),
        ('fixture', runtime / 'fixture.json', 'fixture.json', 0o644),
    ]:
        if not source.is_file() or digest(source) != manifest[key]['sha256'] or source.stat().st_size != manifest[key]['bytes']:
            raise ValueError('Artefact manquant ou modifié : ' + name)
        files.append((source, 'runtime/' + name, mode))
    for source, target in [
        (api / 'app/notebook_release.sha256', 'app/notebook_release.sha256'),
        (runtime / 'release.json', 'runtime/release.json'),
        (api / 'verify-notebook-runtime.py', 'verify-notebook-runtime.py'),
        (api / 'Dockerfile.production-reference', 'Dockerfile'),
        (api / 'requirements.lock', 'requirements.lock'),
        (api / 'postgres-requirements.lock', 'postgres-requirements.lock'),
    ]:
        files.append((source, target, 0o644))
    for source, _, _ in files:
        if not source.is_file():
            raise ValueError('Source manquante : ' + str(source))
    destination.mkdir(parents=True)
    for source, target, mode in files:
        target = destination / target
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        target.chmod(mode)
    return {'files': len(files), 'pythonModules': len(manifest['app']), 'sealVerified': True, 'activated': False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('destination')
    print(json.dumps(materialize(parser.parse_args().destination)))
