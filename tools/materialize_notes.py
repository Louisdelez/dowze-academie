#!/usr/bin/env python3
"""Reconstitue les 619 fichiers historiques, sans installation ni modification de la base."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def materialize(destination):
    destination = Path(destination).resolve()
    if destination.exists() or destination == ROOT or ROOT in destination.parents:
        raise ValueError('La destination doit être inexistante et extérieure au dépôt')
    manifest = json.loads((ROOT / 'work-in-progress/notes/manifest.json').read_text())
    changes = {entry['path']: entry for entry in manifest['changes']}
    prepared = []
    for entry in manifest['expectedSourceFiles']:
        path = Path(entry['path'])
        if path.is_absolute() or '..' in path.parts:
            raise ValueError('Chemin interdit dans le manifeste')
        source = ROOT / path
        if entry['path'] in changes:
            change = changes[entry['path']]
            current = source.read_bytes() if source.is_file() else b''
            before = change.get('beforeSHA256')
            accepted = [before, *change.get('consolidatedBaseSHA256', [])]
            if before and digest(current) not in accepted:
                raise ValueError('La base a changé : ' + entry['path'])
            source = ROOT / 'work-in-progress/notes/overlay' / path
        data = source.read_bytes()
        if digest(data) != entry['sha256'] or len(data) != entry['bytes']:
            raise ValueError('Empreinte cible incorrecte : ' + entry['path'])
        prepared.append((path, source))
    # Vérifier tout avant le premier fichier écrit.
    destination.mkdir(parents=True)
    for path, source in prepared:
        target = destination / path
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    return {'files': len(prepared), 'activated': False, 'destination': str(destination)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('destination')
    print(json.dumps(materialize(parser.parse_args().destination), ensure_ascii=False))
