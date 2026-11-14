"""Assemble a new, relocatable runtime from verified local inputs; never download models."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile

HERMES_COMMIT = '939e45c91d751fadd94dcd1b873ac3cb44846213'


def run(*arguments, **kwargs):
    return subprocess.run(arguments, check=True, text=True, **kwargs)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--python-base', type=Path, required=True)
    parser.add_argument('--hermes-source', type=Path, required=True)
    parser.add_argument('--embedding', type=Path, required=True)
    parser.add_argument('--reranker', type=Path, required=True)
    parser.add_argument('--destination', type=Path, required=True)
    args = parser.parse_args()
    project = Path(__file__).resolve().parents[1]
    destination = args.destination.resolve()
    if destination.exists():
        raise ValueError('Destination must be new; existing artifacts are preserved')
    revision = run('git', '-C', str(args.hermes_source), 'rev-parse', 'HEAD', capture_output=True).stdout.strip()
    if revision != HERMES_COMMIT:
        raise ValueError('Unexpected Hermes source revision')
    manifest = json.loads((project / 'memory-runtime/models-manifest.json').read_text())
    for name, source in [('embedding', args.embedding), ('reranker', args.reranker)]:
        for entry in manifest[name]['files']:
            path = source / entry['path']
            if path.is_symlink() or not path.resolve().is_relative_to(source.resolve()) or path.stat().st_size != entry['size']:
                raise ValueError('Unsafe or incorrectly sized model input')
            digest = hashlib.sha256()
            with path.open('rb') as stream:
                while block := stream.read(1024 * 1024): digest.update(block)
            if digest.hexdigest() != entry['sha256']:
                raise ValueError('Model digest mismatch')
    shutil.copytree(args.python_base, destination, symlinks=True)
    python = destination / ('python.exe' if os.name == 'nt' else 'bin/python3')
    if not python.exists():
        raise ValueError('Standalone Python executable missing')
    with tempfile.TemporaryDirectory(prefix='dowze-runtime-build-') as temporary:
        scratch = Path(temporary)
        archive = scratch / 'hermes.tar'
        with archive.open('wb') as output:
            subprocess.run(['git', '-C', str(args.hermes_source), 'archive', '--format=tar', HERMES_COMMIT], stdout=output, check=True)
        hermes = destination / 'hermes-source'; hermes.mkdir()
        with tarfile.open(archive) as incoming:
            incoming.extractall(hermes, filter='data')
        environment = {**os.environ, 'HERMES_HOME':str(scratch/'hermes-home'), 'HERMES_DISABLE_UPDATE_CHECK':'1', 'PYTHONUTF8':'1'}
        environment.pop('PYTHONPATH', None)
        run('uv', 'pip', 'install', '--python', str(python), '--system', '--break-system-packages', '-e', str(hermes),
            str(project/'memory-runtime'), str(project/'hermes-runtime'), env=environment)
        site = Path(run(str(python), '-I', '-c', 'import sysconfig; print(sysconfig.get_path("purelib"))', capture_output=True, env=environment).stdout.strip())
        if not site.resolve().is_relative_to(destination):
            raise ValueError('Python site-packages escaped the new runtime')
        # Hermes officially supports editable installations. Use the equivalent
        # relative .pth so relocation never refers to the builder's source path.
        paths = list(site.glob('__editable__.hermes_agent-*.pth'))
        if len(paths) != 1: raise ValueError('Unexpected Hermes editable installation')
        paths[0].write_text(os.path.relpath(hermes, site)+'\n')
        for finder in site.glob('__editable___hermes_agent_*_finder.py'): finder.unlink()
        for package in ('hermes_agent', 'dowze_hermes_runtime', 'dowze_memory_runtime'):
            for metadata in site.glob(package+'-*.dist-info/direct_url.json'):
                metadata.unlink()
        versions = run(str(python), '-I', '-c', 'import importlib.metadata as m,json; print(json.dumps({d.metadata["Name"]:d.version for d in m.distributions()}))', capture_output=True, env=environment).stdout
        for name, source in [('embedding', args.embedding), ('reranker', args.reranker)]:
            for entry in manifest[name]['files']:
                target = destination/'models'/name/entry['path']; target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source/entry['path'], target)
        shutil.copy2(project/'memory-runtime/models-manifest.json', destination/'models/manifest.json')
        shutil.copy2(project/'memory-runtime/MODEL-LICENSE-APACHE-2.0.txt', destination/'models/LICENSE-APACHE-2.0.txt')
        report = {'schema':'dowze-runtime@1','python':'3.12','hermes_commit':HERMES_COMMIT,'packages':json.loads(versions),'models':manifest}
        (destination/'INSTALLATION.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
        run(str(python), '-I', '-c', 'from run_agent import AIAgent; from dowze_hermes.desktop import DesktopRuntime; from qdrant_edge import EdgeShard; print("Runtime imports PASS")', cwd=scratch, env=environment)
    print(destination)


if __name__ == '__main__':
    main()
