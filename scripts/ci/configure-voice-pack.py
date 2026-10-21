#!/usr/bin/env python3
"""Apply the verified public voice source to a store build, preserving other settings."""
import json
from pathlib import Path
import re
import sys


SOURCE = "https://voices.flashapp.me/kokoro-en-v1"
KEY = "FLASH_VOICE_PACK_BASE_URL"


def configure(env_file):
    manifest = Path(__file__).resolve().parents[1] / "voice-pack/manifest.json"
    version = json.loads(manifest.read_text())["version"]
    if SOURCE != "https://voices.flashapp.me/" + version:
        raise ValueError("Production voice source does not match the compiled pack version")
    # Keep all unrelated secret bytes and existing file permissions intact.
    with env_file.open("r", newline="") as handle:
        content = handle.read()
    assignment = re.compile(r"^\s*(?:export\s+)?" + KEY + r"\s*=")
    content = "".join(line for line in content.splitlines(keepends=True) if not assignment.match(line))
    if content and not content.endswith(("\n", "\r")):
        content += "\n"
    with env_file.open("w", newline="") as handle:
        handle.write(content + KEY + "=" + SOURCE + "\n")


if __name__ == "__main__":
    try:
        configure(Path(sys.argv[1] if len(sys.argv) > 1 else ".env"))
    except (OSError, ValueError, KeyError):
        # Never echo file contents, URLs from old settings or secret values.
        print("::error::Unable to configure the verified production voice source", file=sys.stderr)
        sys.exit(1)
    print("Configured verified production voice source")
