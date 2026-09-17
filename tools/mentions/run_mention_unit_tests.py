"""Dependency-free unit-test launcher for the deterministic T03 extractor."""

from __future__ import annotations

import test_mention_extractor


def main() -> int:
    tests = [
        getattr(test_mention_extractor, name)
        for name in sorted(dir(test_mention_extractor))
        if name.startswith("test_")
    ]
    for test in tests:
        test()
    print(f"{len(tests)} mention extractor tests passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
