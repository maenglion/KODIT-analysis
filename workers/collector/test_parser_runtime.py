import tempfile
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))

from parser_runtime import (
    RuntimeContractError,
    build_runtime_manifest,
    dependency_pins,
    sanitize_trace,
)


class ParserRuntimeContractTest(unittest.TestCase):
    def setUp(self):
        self.lock = Path(__file__).with_name("requirements.txt")

    def test_lock_is_exact_and_runtime_is_satisfied(self):
        self.assertEqual(
            dependency_pins(self.lock),
            {"olefile": "0.47", "pypdf": "6.0.0"},
        )
        manifest = build_runtime_manifest(self.lock)
        self.assertEqual(manifest["python_implementation"], "CPython")
        self.assertEqual(manifest["python_version"], "3.13.7")
        self.assertEqual(manifest["runtime_contract_status"], "SATISFIED")
        self.assertFalse(manifest["runtime_contract_violations"])
        self.assertEqual(len(manifest["runtime_manifest_sha256"]), 64)
        self.assertEqual(len(manifest["environment_fingerprint"]), 64)

    def test_missing_dependency_is_runtime_failure(self):
        with patch("parser_runtime.installed_version", return_value="UNAVAILABLE"):
            manifest = build_runtime_manifest(self.lock)
        self.assertEqual(manifest["runtime_contract_status"], "FAILED")
        self.assertIn("DEPENDENCY_UNAVAILABLE:olefile", manifest["runtime_contract_violations"])
        self.assertIn("DEPENDENCY_UNAVAILABLE:pypdf", manifest["runtime_contract_violations"])

    def test_unpinned_dependency_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            lock = Path(directory) / "requirements.txt"
            lock.write_text("pypdf>=6\n", encoding="utf-8")
            with self.assertRaises(RuntimeContractError):
                dependency_pins(lock)

    def test_all_windows_traceback_paths_are_sanitized(self):
        trace = '  File "C:\\tmp\\runtime\\module.py", line 10\n'
        sanitized = sanitize_trace(trace)
        self.assertNotIn("C:\\", sanitized)
        self.assertIn("<REDACTED_PATH>", sanitized)


if __name__ == "__main__":
    unittest.main()
