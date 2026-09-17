import hashlib
import io
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

sys.path.insert(0, str(Path(__file__).parent))

from pdf_parser import parse_pdf_bytes
from pdf_parser_runner import run_file


def blank_pdf(*, encrypted=False) -> bytes:
    output = io.BytesIO()
    writer = PdfWriter()
    writer.add_blank_page(width=612, height=792)
    if encrypted:
        writer.encrypt("test-password")
    writer.write(output)
    return output.getvalue()


def text_pdf(text="Hello PDF") -> bytes:
    output = io.BytesIO()
    writer = PdfWriter()
    page = writer.add_blank_page(width=612, height=792)
    font = DictionaryObject({
        NameObject("/Type"): NameObject("/Font"),
        NameObject("/Subtype"): NameObject("/Type1"),
        NameObject("/BaseFont"): NameObject("/Helvetica"),
    })
    page[NameObject("/Resources")] = DictionaryObject({
        NameObject("/Font"): DictionaryObject({
            NameObject("/F1"): writer._add_object(font)
        })
    })
    stream = DecodedStreamObject()
    stream.set_data(f"BT /F1 12 Tf 72 720 Td ({text}) Tj ET".encode("ascii"))
    page[NameObject("/Contents")] = writer._add_object(stream)
    writer.write(output)
    return output.getvalue()


class PdfParserContractTest(unittest.TestCase):
    def test_text_pdf_success(self):
        result = parse_pdf_bytes(text_pdf())
        self.assertEqual(result["result"], "SUCCESS")
        self.assertEqual(result["page_count"], 1)
        self.assertEqual(result["pages_with_text"], 1)
        self.assertGreater(result["extracted_char_count"], 0)

    def test_blank_pdf_has_no_extractable_text(self):
        result = parse_pdf_bytes(blank_pdf())
        self.assertEqual(result["result"], "NO_EXTRACTABLE_TEXT")
        self.assertEqual(result["page_count"], 1)
        self.assertEqual(result["pages_without_text"], 1)

    def test_encrypted_pdf_is_distinct(self):
        result = parse_pdf_bytes(blank_pdf(encrypted=True))
        self.assertEqual(result["result"], "ENCRYPTED")

    def test_wrong_magic_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "strict PDF"):
            parse_pdf_bytes(b"not-pdf")

    def test_parser_exception_propagates_to_runner(self):
        with patch("pdf_parser.PdfReader", side_effect=RuntimeError("synthetic parser error")):
            with self.runner(text_pdf()) as result:
                self.assertEqual(result["result"], "EXTRACTION_FAILED")
                self.assertEqual(result["failure_domain"], "DOCUMENT")
                self.assertEqual(result["failure_code"], "PDF_STRUCTURE_INVALID")

    def test_dependency_metadata_does_not_mask_import_failure(self):
        with patch("pdf_parser.PdfReader", None):
            with self.runner(text_pdf()) as result:
                self.assertEqual(result["failure_domain"], "ENVIRONMENT")
                self.assertEqual(result["failure_code"], "DEPENDENCY_IMPORT_FAILED")

    def test_sha_mismatch_and_traceback_are_audited(self):
        with self.runner(text_pdf(), expected_sha="0" * 64) as result:
            self.assertEqual(result["result"], "EXTRACTION_FAILED")
            self.assertEqual(result["failure_layer"], "INPUT_INTEGRITY")
            self.assertEqual(result["failure_code"], "SHA256_MISMATCH")
            self.assertIn("Traceback", result["full_stack_trace"])
            self.assertNotIn(result["test_root"], result["full_stack_trace"])

    def test_magic_mismatch_is_input_integrity_failure(self):
        data = b"not-a-pdf"
        with self.runner(data) as result:
            self.assertEqual(result["failure_domain"], "INPUT_INTEGRITY")
            self.assertEqual(result["failure_code"], "MAGIC_MISMATCH")

    def test_malformed_pdf_is_document_failure(self):
        data = b"%PDF-1.7\nmalformed"
        with self.runner(data) as result:
            self.assertEqual(result["failure_domain"], "DOCUMENT")
            self.assertIn(result["failure_code"], {"PDF_READ_FAILED", "PDF_STRUCTURE_INVALID"})

    def test_extraction_exception_is_extraction_failure(self):
        class BrokenPage:
            def extract_text(self):
                raise RuntimeError("synthetic extraction failure")

        class FakeReader:
            is_encrypted = False
            pages = [BrokenPage()]

            def __init__(self, *_args, **_kwargs):
                pass

        with patch("pdf_parser.PdfReader", FakeReader):
            with self.runner(text_pdf()) as result:
                self.assertEqual(result["failure_domain"], "EXTRACTION")
                self.assertEqual(result["failure_code"], "TEXT_EXTRACTION_FAILED")

    def test_extract_hash_is_deterministic_and_identity_is_absent(self):
        data = text_pdf()
        with self.runner(data) as first, self.runner(data) as second:
            self.assertEqual(first["result"], "SUCCESS")
            self.assertEqual(first["extract_hash"], second["extract_hash"])
            self.assertEqual(first["failure_domain"], "")
            self.assertEqual(first["failure_code"], "")
            self.assertNotIn("identity_matched", first)

    def test_success_can_emit_private_extraction_without_polluting_run_record(self):
        data = text_pdf("Private text")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "sample.pdf"
            source.write_bytes(data)
            artifacts = []
            result = run_file(
                source,
                expected_sha256=hashlib.sha256(data).hexdigest(),
                file_name=source.name,
                evidence_as_of="2026-09-08T00:00:00+09:00",
                lock_path=Path(__file__).with_name("requirements.txt"),
                redact_roots=[root],
                extraction_sink=artifacts.append,
            )
        self.assertEqual(result["result"], "SUCCESS")
        self.assertNotIn("extracted_text", result)
        self.assertEqual(len(artifacts), 1)
        self.assertEqual(artifacts[0]["parser_run_id"], result["parser_run_id"])
        self.assertEqual(artifacts[0]["extract_hash"], result["extract_hash"])
        self.assertIn("Private text", artifacts[0]["extracted_text"])

    def test_full_runtime_and_source_provenance(self):
        with self.runner(text_pdf()) as result:
            required = {
                "parser_run_id", "provenance", "evidence_as_of", "input_sha256",
                "file_name", "detected_magic", "parser_name", "parser_version",
                "parser_engine", "parser_engine_version", "code_commit_sha",
                "parser_code_dirty", "parser_source_sha256", "runtime_version",
                "dependency_lock_hash", "runtime_manifest_sha256",
                "environment_fingerprint", "environment", "started_at", "finished_at",
                "result", "failure_layer", "failure_domain", "failure_code",
                "error_class", "error_message",
                "full_stack_trace", "extract_hash", "extracted_char_count",
                "page_count", "replacement_char_count", "replacement_char_ratio",
                "hangul_char_count", "hangul_ratio", "pages_with_text",
                "pages_without_text",
            }
            self.assertTrue(required.issubset(result))
            self.assertEqual(result["environment"]["runtime_contract_status"], "SATISFIED")
            self.assertEqual(result["parser_engine_version"], "6.0.0")
            self.assertEqual(len(result["parser_source_sha256"]), 64)
            self.assertIn(result["parser_code_dirty"], {True, False})

    class runner:
        def __init__(self, data, expected_sha=None):
            self.data = data
            self.expected_sha = expected_sha

        def __enter__(self):
            self.temp = tempfile.TemporaryDirectory()
            root = Path(self.temp.name)
            source = root / "sample.pdf"
            source.write_bytes(self.data)
            self.result = run_file(
                source,
                expected_sha256=self.expected_sha or hashlib.sha256(self.data).hexdigest(),
                file_name=source.name,
                evidence_as_of="2026-09-08T00:00:00+09:00",
                lock_path=Path(__file__).with_name("requirements.txt"),
                redact_roots=[root],
            )
            self.result["test_root"] = str(root)
            return self.result

        def __exit__(self, exc_type, exc, tb):
            self.temp.cleanup()


if __name__ == "__main__":
    unittest.main()
