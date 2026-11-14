"""Fetch pinned public inputs and assemble the Desktop runtime on the build platform."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import urllib.request

COMMIT = '939e45c91d751fadd94dcd1b873ac3cb44846213'
PYTHON = '3.12.13'

def run(*args, **kwargs):
    return subprocess.run(args, check=True, text=True, **kwargs)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--cache', type=Path, required=True)
    parser.add_argument('--destination', type=Path, required=True)
    args = parser.parse_args()
    project = Path(__file__).resolve().parents[1]
    if args.destination.exists(): raise ValueError('Runtime destination must be new')
    cache = args.cache.resolve(); cache.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((project/'memory-runtime/models-manifest.json').read_text())
    for name in ('embedding', 'reranker'):
        model = manifest[name]
        for entry in model['files']:
            path = cache/name/entry['path']; path.parent.mkdir(parents=True, exist_ok=True)
            if not path.exists():
                temporary = path.with_suffix(path.suffix+'.download')
                if temporary.exists(): raise ValueError(f'Previous incomplete download preserved: {temporary}')
                url = f"https://huggingface.co/{model['repo']}/resolve/{model['revision']}/{entry['path']}?download=true"
                digest = hashlib.sha256(); size = 0
                try:
                    with urllib.request.urlopen(url, timeout=90) as response, temporary.open('xb') as output:
                        while block := response.read(1024*1024):
                            size += len(block)
                            if size > entry['size']: raise ValueError('Model exceeds pinned size')
                            digest.update(block); output.write(block)
                    if size != entry['size'] or digest.hexdigest() != entry['sha256']: raise ValueError('Model digest mismatch')
                    temporary.rename(path)
                except Exception:
                    temporary.unlink(missing_ok=True)
                    raise
    source = cache/'hermes-source'
    if not source.exists():
        run('git', 'init', str(source))
        run('git', '-C', str(source), 'remote', 'add', 'origin', 'https://github.com/NousResearch/hermes-agent.git')
        run('git', '-C', str(source), 'fetch', '--depth=1', 'origin', COMMIT)
        run('git', '-C', str(source), 'checkout', '--detach', COMMIT)
    run('uv', 'python', 'install', PYTHON)
    python = Path(run('uv', 'python', 'find', '--managed-python', PYTHON, capture_output=True).stdout.strip())
    base = python.parent if sys.platform == 'win32' else python.parent.parent
    run(sys.executable, str(project/'scripts/assemble-desktop-runtime.py'), '--python-base', str(base),
        '--hermes-source', str(source), '--embedding', str(cache/'embedding'), '--reranker', str(cache/'reranker'),
        '--destination', str(args.destination.resolve()))

if __name__ == '__main__': main()
