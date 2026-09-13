import hashlib
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from hwp_parser_runner import detect_magic, normalize_identity, run_file


class HwpParserRunnerContractTest(unittest.TestCase):
    def test_magic_detection_is_explicit(self):
        self.assertEqual(detect_magic(bytes.fromhex("d0cf11e0a1b11ae1") + b"x"), "OLE_HWP")
        self.assertEqual(detect_magic(b"PK\x03\x04x"), "ZIP_HWPX")
        self.assertEqual(detect_magic(b"%PDF-1.7"), "PDF")

    def test_identity_normalization_preserves_meaning(self):
        self.assertEqual(normalize_identity("경비 기준"), normalize_identity("경비기준"))

    def test_failure_keeps_traceback_and_provenance(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "broken.hwp"
            source.write_bytes(b"not-hwp")
            digest = hashlib.sha256(source.read_bytes()).hexdigest()
            result = run_file(
                source,
                expected_sha256=digest,
                file_name=source.name,
                regulation_name="테스트 규정",
                aliases=[],
                evidence_as_of="2026-09-08T00:00:00+09:00",
                lock_path=Path(__file__).with_name("requirements.txt"),
                redact_roots=[root],
            )
        self.assertEqual(result["result"], "FAILED")
        self.assertEqual(result["provenance"], "ACTUAL_EXECUTION")
        self.assertIn(result["error_class"], {"RuntimeError", "ValueError"})
        self.assertIn("Traceback", result["full_stack_trace"])
        self.assertNotIn(str(root), result["full_stack_trace"])
        self.assertTrue(result["environment_fingerprint"])


if __name__ == "__main__":
    unittest.main()
