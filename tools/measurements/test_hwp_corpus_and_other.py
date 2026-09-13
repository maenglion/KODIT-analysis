import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from classify_other_corpus import classify_bytes
from run_hwp_corpus_batch import classify


def hwp_attempt(result="SUCCESS", identity=True, sha="a" * 64, magic="OLE_HWP"):
    return {
        "result": result,
        "identity_matched": identity,
        "input_sha256": sha,
        "detected_magic": magic,
    }


class HwpCorpusClassificationTest(unittest.TestCase):
    def test_success(self):
        self.assertEqual(
            classify([hwp_attempt(), hwp_attempt()], "a" * 64),
            "PARSE_OK_AND_IDENTIFIED",
        )

    def test_identity_unresolved(self):
        attempts = [
            hwp_attempt("IDENTITY_NOT_FOUND", False),
            hwp_attempt("IDENTITY_NOT_FOUND", False),
        ]
        self.assertEqual(
            classify(attempts, "a" * 64),
            "PARSE_OK_IDENTITY_UNRESOLVED",
        )

    def test_parser_failure(self):
        attempts = [hwp_attempt("FAILED", False), hwp_attempt("FAILED", False)]
        self.assertEqual(classify(attempts, "a" * 64), "PARSE_FAILED")

    def test_integrity_mismatch(self):
        self.assertEqual(
            classify([hwp_attempt(sha="b" * 64), hwp_attempt()], "a" * 64),
            "INPUT_INTEGRITY_MISMATCH",
        )


class OtherMagicClassificationTest(unittest.TestCase):
    def test_drmone_precedes_extension_or_content_guess(self):
        self.assertEqual(
            classify_bytes(b"\x9b DRMONE  This Document is encrypted"),
            ("DRMONE_CONTAINER", "UNSUPPORTED_ENCRYPTED_CONTAINER"),
        )

    def test_fasoo_secure_container_is_not_html(self):
        self.assertEqual(
            classify_bytes(b"<!-- FasooSecureContainer - Ver 1 -->"),
            ("FASOO_SECURE_CONTAINER", "UNSUPPORTED_ENCRYPTED_CONTAINER"),
        )

    def test_pdf_magic(self):
        self.assertEqual(classify_bytes(b"%PDF-1.7"), ("PDF", "PDF_RUNNER"))

    def test_unknown_remains_unknown(self):
        self.assertEqual(
            classify_bytes(b"not a known format"),
            ("UNKNOWN", "FORMAT_INSPECTION_REQUIRED"),
        )


if __name__ == "__main__":
    unittest.main()
