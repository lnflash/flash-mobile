#!/usr/bin/env python3
"""List Flashcard Maestro flows that failed or were skipped after a driver loss."""

import sys
import xml.etree.ElementTree as ET
from pathlib import Path


def main() -> None:
    expected = {
        path
        for path in Path(".maestro/flashcard").glob("*.yaml")
        if path.name != "config.yaml"
    }
    try:
        cases = list(ET.parse(sys.argv[1]).iter("testcase"))
    except (IndexError, OSError, ET.ParseError):
        return  # No report: the workflow retries the whole directory.
    if not cases:
        return

    seen = set()
    retry = set()
    for case in cases:
        path = Path(case.get("file", ""))
        if path not in expected:
            continue
        seen.add(path)
        if case.find("failure") is not None or case.find("error") is not None:
            retry.add(path)

    retry.update(expected - seen)
    for path in sorted(retry):
        print(path)


if __name__ == "__main__":
    main()
