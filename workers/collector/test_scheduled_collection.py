import importlib.util
import unittest
from datetime import datetime, timezone
from pathlib import Path

MODULE_PATH = Path(__file__).with_name("scheduled_collection.py")
SPEC = importlib.util.spec_from_file_location("scheduled_collection", MODULE_PATH)
scheduled = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(scheduled)


class FakeRpc:
    def __init__(self, claim, draft=False):
        self.claim = claim
        self.draft = draft
        self.calls = []

    def call(self, function, payload):
        self.calls.append((function, payload))
        if function == "claim_collection_run":
            return [self.claim]
        return [{
            "status": payload["p_status"],
            "draft_release_id": "draft-id" if self.draft and payload["p_status"] == "succeeded" else None,
            "last_successful_at": "2026-09-18T00:00:00+00:00",
            "next_due_at": "2026-09-28T00:00:00+00:00",
        }]


NOW = datetime(2026, 9, 9, tzinfo=timezone.utc)
FINGERPRINT = "a" * 64


def result(fingerprint=FINGERPRINT, changed=False):
    return {
        "fingerprint": fingerprint,
        "source_results": [{"source": "kodit", "status": "succeeded"}],
        "failures": [],
        "observations": [{
            "title": "테스트 규정", "normalized_url": "https://example.test/rule.pdf",
            "final_url": "https://example.test/rule.pdf", "sha256": "b" * 64,
            "content_length": 10, "mime_type": "application/pdf", "detected_format": "pdf",
            "http_status": 200, "etag": "", "last_modified": "", "file_name": "rule.pdf",
            "verification": "anchors_confirmed", "changed": changed,
        }],
    }


class ScheduleContractTest(unittest.TestCase):
    def test_not_due_skips_collector(self):
        rpc = FakeRpc({"outcome": "not_due", "crawl_run_id": "not-due-id", "next_due_at": "2026-09-18T10:20:45+00:00"})
        called = False
        def collector():
            nonlocal called
            called = True
        self.assertEqual(scheduled.execute(rpc, "manual", NOW, collector)["outcome"], "not_due")
        self.assertFalse(called)

    def test_tenth_day_runs_and_no_change_is_recorded(self):
        rpc = FakeRpc({"outcome": "claimed", "crawl_run_id": "run-id", "next_due_at": NOW.isoformat(), "previous_fingerprint": FINGERPRINT})
        output = scheduled.execute(rpc, "schedule", NOW, result)
        self.assertEqual(output["outcome"], "no_change")
        self.assertEqual(rpc.calls[-1][1]["p_changed_count"], 0)

    def test_changed_collection_creates_draft_only(self):
        rpc = FakeRpc({"outcome": "claimed", "crawl_run_id": "run-id", "next_due_at": NOW.isoformat(), "previous_fingerprint": "c" * 64}, draft=True)
        output = scheduled.execute(rpc, "schedule", NOW, lambda: result(changed=True))
        self.assertEqual(output["outcome"], "succeeded")
        self.assertTrue(output["draft_created"])

    def test_locked_run_does_not_collect(self):
        rpc = FakeRpc({"outcome": "locked", "crawl_run_id": None, "next_due_at": NOW.isoformat()})
        self.assertEqual(scheduled.execute(rpc, "schedule", NOW, lambda: self.fail("collector ran"))["outcome"], "locked")

    def test_failure_uses_failed_completion_without_advancing_success(self):
        rpc = FakeRpc({"outcome": "claimed", "crawl_run_id": "run-id", "next_due_at": "2026-09-18T10:20:45+00:00", "last_successful_at": "2026-09-08T10:20:45+00:00", "previous_fingerprint": FINGERPRINT})
        with self.assertRaises(RuntimeError):
            scheduled.execute(rpc, "schedule", NOW, lambda: (_ for _ in ()).throw(RuntimeError("source failed")))
        failure = rpc.calls[-1][1]
        self.assertEqual(failure["p_status"], "failed")
        self.assertNotIn("service", failure["p_error_summary"].lower())


if __name__ == "__main__":
    unittest.main()
