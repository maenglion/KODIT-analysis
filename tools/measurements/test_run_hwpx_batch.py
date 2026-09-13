import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from run_hwpx_batch import alio_identities, classify, item_identity, kodit_identities


def attempt(result="SUCCESS", identity=True, sha="a" * 64, magic="ZIP_HWPX"):
    return {
        "result": result,
        "identity_matched": identity,
        "input_sha256": sha,
        "detected_magic": magic,
    }


class HwpxBatchContractTest(unittest.TestCase):
    def test_parse_and_identity_success(self):
        self.assertEqual(
            classify([attempt(), attempt()], "a" * 64),
            "PARSE_OK_AND_IDENTIFIED",
        )

    def test_identity_unresolved_is_not_parser_failure(self):
        attempts = [
            attempt("IDENTITY_NOT_FOUND", False),
            attempt("IDENTITY_NOT_FOUND", False),
        ]
        self.assertEqual(
            classify(attempts, "a" * 64),
            "PARSE_OK_IDENTITY_UNRESOLVED",
        )

    def test_parser_failure_is_separate(self):
        attempts = [attempt("FAILED", False), attempt("FAILED", False)]
        self.assertEqual(classify(attempts, "a" * 64), "PARSE_FAILED")

    def test_integrity_mismatch_has_priority(self):
        attempts = [attempt(sha="b" * 64), attempt(magic="OLE_HWP")]
        self.assertEqual(
            classify(attempts, "a" * 64),
            "INPUT_INTEGRITY_MISMATCH",
        )

    def test_kodit_identity_uses_post_and_attachment_key(self):
        mapping = kodit_identities(
            [
                {
                    "post_number": "100",
                    "evidence_file_key": "abc",
                    "rule_name": "긴 규정 이름",
                },
                {
                    "post_number": "100",
                    "evidence_file_key": "abc",
                    "rule_name": "별칭",
                },
            ]
        )
        names, source = item_identity(
            {"relative_path": "kodit/100/abc.hwpx"}, mapping, {}
        )
        self.assertEqual(names, ["긴 규정 이름", "별칭"])
        self.assertEqual(source, "RULE_MENTIONS_ATTACHMENT_KEY")

    def test_alio_identity_uses_rule_and_file_ids(self):
        mapping = alio_identities(
            [
                {
                    "rule_id": "200",
                    "title": "ALIO 규정",
                    "attachments": [{"file_no": "300"}],
                }
            ]
        )
        names, source = item_identity(
            {"relative_path": "alio/200/300.hwp"}, {}, mapping
        )
        self.assertEqual(names, ["ALIO 규정"])
        self.assertEqual(source, "ALIO_RULE_AND_FILE_ID")

    def test_unmapped_identity_stays_empty(self):
        names, source = item_identity(
            {"relative_path": "kodit/100/missing.hwpx"}, {}, {}
        )
        self.assertEqual(names, [])
        self.assertEqual(source, "RULE_MENTIONS_ATTACHMENT_KEY")


if __name__ == "__main__":
    unittest.main()
