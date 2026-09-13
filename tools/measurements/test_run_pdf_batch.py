import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from run_pdf_batch import classify_outcome, metric_distribution, percentile


class PdfBatchContractTest(unittest.TestCase):
    def test_input_integrity_failure_has_batch_outcome(self):
        attempt = {"failure_domain": "INPUT_INTEGRITY", "result": "EXTRACTION_FAILED"}
        self.assertEqual(classify_outcome(attempt), "INPUT_INTEGRITY_MISMATCH")

    def test_parser_outcome_is_preserved(self):
        attempt = {"failure_domain": "", "result": "NO_EXTRACTABLE_TEXT"}
        self.assertEqual(classify_outcome(attempt), "NO_EXTRACTABLE_TEXT")

    def test_percentile_is_interpolated(self):
        self.assertEqual(percentile([0, 10, 20, 30, 40], 0.95), 38)

    def test_metric_distribution_has_requested_shape(self):
        attempts = [{
            "page_count": 1,
            "extracted_char_count": 2,
            "replacement_char_ratio": 0.0,
            "hangul_ratio": 0.5,
            "pages_with_text": 1,
            "pages_without_text": 0,
        }]
        result = metric_distribution([{"attempts": attempts}])
        self.assertEqual(set(result), {
            "page_count", "extracted_char_count", "replacement_char_ratio",
            "hangul_ratio", "pages_with_text", "pages_without_text",
        })
        self.assertEqual(result["hangul_ratio"]["median"], 0.5)


if __name__ == "__main__":
    unittest.main()
