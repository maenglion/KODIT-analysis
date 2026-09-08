import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from collect_regulation import VerifiedPdf, build_upsert_sql, normalize_url


class CollectorContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.profile = json.loads(
            (Path(__file__).parent / "profiles" / "investment_option_guarantee.json").read_text(encoding="utf-8")
        )
        cls.pdf = VerifiedPdf(
            sha256=cls.profile["expectedSha256"],
            size_bytes=cls.profile["expectedBytes"],
            page_count=cls.profile["expectedPages"],
            mime_type="application/pdf",
            http_mime_type="application-download",
            response_file_name=cls.profile["fileName"],
            final_url=cls.profile["url"],
            http_status=200,
            etag=None,
            last_modified=None,
            extracted_text="2024. 2. 23",
            unicode_quality_ok=False,
            anchors_confirmed=True,
            anchor_confirmation_method="rendered-human-confirmation",
            checked_at="2026-09-08T00:00:00+00:00",
        )

    def test_normalizes_query_order_and_removes_fragment(self):
        self.assertEqual(normalize_url("HTTPS://Example.COM/a?z=2&a=1#x"), "https://example.com/a?a=1&z=2")

    def test_rejects_non_http_url(self):
        with self.assertRaises(ValueError):
            normalize_url("file:///private/document.pdf")

    def test_profile_integrity_contract(self):
        self.assertEqual(self.profile["expectedBytes"], 1060212)
        self.assertEqual(self.profile["expectedPages"], 45)
        self.assertEqual(self.profile["expectedSha256"], "d4a734b94bfdafec03e267a3ef592dbc02c923eb98a43f0737d455298dd38804")

    def test_upsert_is_idempotent_and_separates_claims(self):
        sql = build_upsert_sql(self.profile, self.pdf)
        self.assertIn("on conflict(sha256) do update", sql.lower())
        self.assertIn("claim_type='fulltext_availability'", sql)
        self.assertIn("claim_type='currency'", sql)
        self.assertIn("'CURRENT_UNVERIFIED'", sql)
        self.assertNotIn('"case".', sql)
        self.assertNotIn("storage.", sql)


if __name__ == "__main__":
    unittest.main()
