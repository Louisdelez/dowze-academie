"""Fixed image entrypoint for Root's network-less runtime qualification.

Never imports main and never reads database credentials. It executes only the
image-sealed validator with its non-user fixture, including a negative control.
"""
import json
import sys

sys.path.insert(0, "/srv/dowze/app")
from app.notebook_startup import verify_runtime

print(json.dumps(verify_runtime(), sort_keys=True, separators=(",", ":")))
