import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from run_hwp_batch import classify


def attempt(result="SUCCESS", identity=True, sha="a" * 64, magic="OLE_HWP"):
    return {
        "result": result,
        "identity_matched": identity,
        "input_sha256": sha,
        "detected_magic": magic,
    }


class BatchClassificationContractTest(unittest.TestCase):
    def test_parse_and_identity_success(self):
        self.assertEqual(classify([attempt(), attempt()], "a" * 64), "PARSE_OK_AND_IDENTIFIED")

    def test_identity_unresolved_is_not_parse_failure(self):
        attempts = [attempt("IDENTITY_NOT_FOUND", False), attempt("IDENTITY_NOT_FOUND", False)]
        self.assertEqual(classify(attempts, "a" * 64), "PARSE_OK_IDENTITY_UNRESOLVED")

    def test_parser_failure_is_separate(self):
        self.assertEqual(classify([attempt("FAILED", False), attempt("FAILED", False)], "a" * 64), "PARSE_FAILED")

    def test_input_integrity_has_priority(self):
        attempts = [attempt(sha="b" * 64), attempt(magic="ZIP_HWPX")]
        self.assertEqual(classify(attempts, "a" * 64), "INPUT_INTEGRITY_MISMATCH")


if __name__ == "__main__":
    unittest.main()
