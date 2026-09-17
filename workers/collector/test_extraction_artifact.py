import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from extraction_artifact import (
    EXTRACTION_CONTRACT_VERSION,
    build_extraction_artifact,
    sha256_text,
    write_extraction_artifact,
)


class ExtractionArtifactContractTest(unittest.TestCase):
    def record(self, text="규정 본문"):
        return {
            "parser_run_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            "input_sha256": "1" * 64,
            "extract_hash": sha256_text(text),
            "extracted_char_count": len(text),
        }

    def test_artifact_contains_text_and_stable_content_identity(self):
        text = "규정 본문"
        artifact = build_extraction_artifact(self.record(text), text)
        self.assertEqual(artifact["extraction_contract_version"], EXTRACTION_CONTRACT_VERSION)
        self.assertEqual(artifact["document_sha256"], "1" * 64)
        self.assertEqual(artifact["extract_hash"], sha256_text(text))
        self.assertEqual(artifact["extracted_char_count"], len(text))
        self.assertEqual(artifact["extracted_text"], text)

    def test_mismatched_hash_or_count_is_rejected(self):
        record = self.record()
        record["extract_hash"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "hash"):
            build_extraction_artifact(record, "규정 본문")

        record = self.record()
        record["extracted_char_count"] = 1
        with self.assertRaisesRegex(ValueError, "character count"):
            build_extraction_artifact(record, "규정 본문")

    def test_write_is_idempotent_but_never_overwrites(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "artifact.json"
            artifact = build_extraction_artifact(self.record(), "규정 본문")
            write_extraction_artifact(path, artifact)
            original = path.read_bytes()
            write_extraction_artifact(path, artifact)
            self.assertEqual(path.read_bytes(), original)

            changed = dict(artifact)
            changed["extracted_text"] = "다른 본문"
            with self.assertRaises(FileExistsError):
                write_extraction_artifact(path, changed)


if __name__ == "__main__":
    unittest.main()
