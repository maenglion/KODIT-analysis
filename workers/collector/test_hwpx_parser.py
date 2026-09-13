import hashlib
import io
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from hwpx_parser import HP_NS, detect_magic, parse_hwpx_bytes
from hwpx_parser_runner import run_file


def section_xml(paragraphs):
    body = "".join(f"<hp:p><hp:run><hp:t>{text}</hp:t></hp:run></hp:p>" for text in paragraphs)
    return f'<?xml version="1.0" encoding="UTF-8"?><hp:sec xmlns:hp="{HP_NS}">{body}</hp:sec>'


def make_hwpx(sections, *, mimetype="application/hwp+zip", content_hpf=True, header=True):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        if mimetype is not None:
            archive.writestr("mimetype", mimetype)
        if content_hpf:
            archive.writestr("Contents/content.hpf", "<package/>")
        if header:
            archive.writestr("Contents/header.xml", "<header/>")
        for name, body in sections.items():
            archive.writestr(name, body)
    return buffer.getvalue()


class HwpxParserContractTest(unittest.TestCase):
    def test_strict_structure_detects_hwpx(self):
        data = make_hwpx({"Contents/section0.xml": section_xml(["본문"])})
        self.assertEqual(detect_magic(data), "ZIP_HWPX")

    def test_section_alone_does_not_prove_hwpx(self):
        data = make_hwpx(
            {"Contents/section0.xml": section_xml(["본문"])},
            mimetype=None,
            content_hpf=False,
            header=False,
        )
        self.assertEqual(detect_magic(data), "ZIP_OTHER")

    def test_wrong_mimetype_is_not_hwpx(self):
        data = make_hwpx(
            {"Contents/section0.xml": section_xml(["본문"])},
            mimetype="application/zip",
        )
        self.assertEqual(detect_magic(data), "ZIP_OTHER")

    def test_numeric_section_order(self):
        data = make_hwpx({
            "Contents/section10.xml": section_xml(["열째"]),
            "Contents/section2.xml": section_xml(["둘째"]),
            "Contents/section0.xml": section_xml(["첫째"]),
        })
        text = parse_hwpx_bytes(data)
        self.assertLess(text.index("첫째"), text.index("둘째"))
        self.assertLess(text.index("둘째"), text.index("열째"))

    def test_table_cells_use_tabs(self):
        xml = f'''<hp:sec xmlns:hp="{HP_NS}"><hp:p><hp:tbl><hp:tr>
        <hp:tc><hp:p><hp:t>구분</hp:t></hp:p></hp:tc>
        <hp:tc><hp:p><hp:t>값</hp:t></hp:p></hp:tc>
        </hp:tr></hp:tbl></hp:p></hp:sec>'''
        self.assertIn("구분\t값", parse_hwpx_bytes(make_hwpx({"Contents/section0.xml": xml})))

    def test_empty_body_fails(self):
        with self.assertRaisesRegex(ValueError, "empty"):
            parse_hwpx_bytes(make_hwpx({"Contents/section0.xml": section_xml([])}))

    def test_unsafe_xml_declaration_fails(self):
        xml = f'<!DOCTYPE x [<!ENTITY y "z">]><hp:sec xmlns:hp="{HP_NS}"/>'
        with self.assertRaisesRegex(ValueError, "unsafe XML"):
            parse_hwpx_bytes(make_hwpx({"Contents/section0.xml": xml}))


class HwpxRunnerContractTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.lock = Path(__file__).with_name("requirements.txt")

    def tearDown(self):
        self.temp.cleanup()

    def execute(self, data, expected_name="안전보건규정", expected_sha=None):
        path = self.root / "sample.hwpx"
        path.write_bytes(data)
        return run_file(
            path,
            expected_sha256=expected_sha or hashlib.sha256(data).hexdigest(),
            file_name=path.name,
            regulation_name=expected_name,
            aliases=[],
            evidence_as_of="2026-09-08T00:00:00+09:00",
            lock_path=self.lock,
            redact_roots=[self.root],
        )

    def test_success_has_full_hwp_provenance_contract(self):
        result = self.execute(make_hwpx({"Contents/section0.xml": section_xml(["안전 보건 규정", "제1조 목적"])}))
        self.assertEqual(result["result"], "SUCCESS")
        self.assertTrue(result["identity_matched"])
        required = {
            "parser_run_id", "provenance", "evidence_as_of", "input_sha256", "detected_magic",
            "parser_name", "parser_version", "parser_engine", "parser_engine_version",
            "code_commit_sha", "parser_code_dirty", "parser_source_sha256", "runtime_version",
            "dependency_lock_hash", "environment_fingerprint", "started_at", "finished_at",
            "result", "identity_matched", "error_class", "error_message", "full_stack_trace",
            "extract_hash", "extracted_char_count",
        }
        self.assertTrue(required.issubset(result))
        self.assertEqual(result["provenance"], "ACTUAL_EXECUTION")
        self.assertEqual(result["detected_magic"], "ZIP_HWPX")
        self.assertTrue(result["extract_hash"])

    def test_common_identity_normalization_handles_punctuation(self):
        result = self.execute(
            make_hwpx({"Contents/section0.xml": section_xml(["안전·보건 규정"])}),
            expected_name="안전 보건규정",
        )
        self.assertEqual(result["result"], "SUCCESS")

    def test_identity_not_found_is_not_parse_failure(self):
        result = self.execute(make_hwpx({"Contents/section0.xml": section_xml(["다른 규정"])}))
        self.assertEqual(result["result"], "IDENTITY_NOT_FOUND")
        self.assertFalse(result["identity_matched"])
        self.assertFalse(result["error_class"])

    def test_sha_mismatch_records_full_traceback(self):
        data = make_hwpx({"Contents/section0.xml": section_xml(["안전보건규정"])})
        result = self.execute(data, expected_sha="0" * 64)
        self.assertEqual(result["result"], "FAILED")
        self.assertEqual(result["error_class"], "ValueError")
        self.assertIn("Traceback", result["full_stack_trace"])
        self.assertNotIn(str(self.root), result["full_stack_trace"])


if __name__ == "__main__":
    unittest.main()
