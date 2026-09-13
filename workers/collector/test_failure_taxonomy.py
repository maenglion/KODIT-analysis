import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from failure_taxonomy import (
    DependencyImportFailed,
    DocumentParseFailed,
    MagicMismatch,
    Sha256Mismatch,
    TextExtractionFailed,
    classify_failure,
)
from parser_runtime import RuntimeContractError


class FailureTaxonomyContractTest(unittest.TestCase):
    def assert_taxonomy(self, exception, domain, code):
        result = classify_failure(exception)
        self.assertEqual((result.domain, result.code), (domain, code))

    def test_minimum_taxonomy(self):
        cases = (
            (DependencyImportFailed(), "ENVIRONMENT", "DEPENDENCY_IMPORT_FAILED"),
            (RuntimeContractError("bad runtime"), "ENVIRONMENT", "RUNTIME_CONTRACT_FAILED"),
            (Sha256Mismatch(), "INPUT_INTEGRITY", "SHA256_MISMATCH"),
            (MagicMismatch(), "INPUT_INTEGRITY", "MAGIC_MISMATCH"),
            (DocumentParseFailed("bad document"), "DOCUMENT", "PARSE_FAILED"),
            (TextExtractionFailed(), "EXTRACTION", "TEXT_EXTRACTION_FAILED"),
        )
        for exception, domain, code in cases:
            with self.subTest(code=code):
                self.assert_taxonomy(exception, domain, code)


if __name__ == "__main__":
    unittest.main()
