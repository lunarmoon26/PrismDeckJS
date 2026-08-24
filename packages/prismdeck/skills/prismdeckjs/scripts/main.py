#!/usr/bin/env python3
"""Python compatibility entrypoint for the PrismDeckJS shared skill."""

import json
from pathlib import Path
import subprocess
import sys


def main() -> int:
    stdin = getattr(sys.stdin, "buffer", sys.stdin)
    payload = stdin.read()
    if isinstance(payload, str):
        payload = payload.encode()
    try:
        request = json.loads(payload)
    except (json.JSONDecodeError, UnicodeDecodeError):
        request = None

    if request == {} or (isinstance(request, dict) and request.get("action") == "describe"):
        print(json.dumps({"ok": True, "plugin": "prismdeckjs", "actions": ["export_html"]}))
        return 0

    script = Path(__file__).with_name("main.mjs")
    try:
        result = subprocess.run(
            ["node", str(script)],
            input=payload,
            capture_output=True,
            check=False,
        )
    except FileNotFoundError:
        print("Could not run main.mjs: node was not found", file=sys.stderr)
        return 1

    if hasattr(sys.stdout, "buffer"):
        sys.stdout.buffer.write(result.stdout)
        sys.stderr.buffer.write(result.stderr)
    else:
        sys.stdout.write(result.stdout.decode())
        sys.stderr.write(result.stderr.decode())
    return result.returncode


if __name__ == "__main__":
    sys.exit(main())
