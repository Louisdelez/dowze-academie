from __future__ import annotations

import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
from urllib.request import urlopen


def main() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix="dowze-api-smoke-") as temporary:
        root = Path(temporary)
        environment = os.environ.copy()
        environment.update(
            {
                "DOWZE_ENV": "test",
                "DOWZE_DATABASE_PATH": str(root / "api.sqlite3"),
                "DOWZE_PACKAGE_DIR": str(root / "packages"),
                "DOWZE_ALLOWED_ORIGINS": "http://127.0.0.1:4173",
            }
        )
        process = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "uvicorn",
                "app.main:app",
                "--host",
                "127.0.0.1",
                "--port",
                str(port),
                "--no-server-header",
            ],
            env=environment,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        try:
            deadline = time.monotonic() + 15
            body = None
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    output = process.stdout.read() if process.stdout else ""
                    raise RuntimeError(f"server exited early: {output}")
                try:
                    with urlopen(f"http://127.0.0.1:{port}/health", timeout=1) as response:
                        body = json.loads(response.read())
                    break
                except OSError:
                    time.sleep(0.05)
            if body != {"status": "ok"}:
                raise RuntimeError("health endpoint did not become ready")
            with urlopen(f"http://127.0.0.1:{port}/v1/catalog", timeout=2) as response:
                catalog = json.loads(response.read())
            if catalog != {"items": []}:
                raise RuntimeError("initial catalog is not empty")
            print(json.dumps({"host": "127.0.0.1", "port": port, "health": body, "catalog": catalog}))
            return 0
        finally:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
            if process.stdout is not None:
                process.stdout.close()
            # Windows can retain SQLite handles for a brief instant after process exit.
            time.sleep(0.2)


if __name__ == "__main__":
    raise SystemExit(main())
