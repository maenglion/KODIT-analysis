# 규정 release 승인 절차

공개 사이트는 `core.releases.status = 'published'`, `is_latest = true`, `published_at <= now()`를 모두 만족하는 release의 고정 스냅샷만 읽는다. 이 조건을 만족하는 release가 없으면 2026-09-08 번들 검토본을 `검토본 · DB 승인 전`으로 표시한다.

## 준비와 dry-run

1. 승인 대상은 `draft`, `is_latest=false`여야 한다.
2. `workers/collector/stage_review_release.py`로 CSV를 release 스냅샷에 멱등 적재한다.
3. `publish_regulation_release(..., p_dry_run=true)`로 규정·판정·주장 건수가 모두 채워졌는지 확인한다.
4. anon 및 일반 authenticated 토큰으로 승인 RPC가 거절되는지 `supabase/tests/remote_approved_release_contract.mjs`로 확인한다.

실제 자격증명은 로컬 프로세스 또는 GitHub Actions Secrets에만 둔다. 명령행 인자, 로그, artifact에는 넣지 않는다.

## 명시적 승인

GitHub Actions의 `Publish regulation release`를 수동 실행하고 다음을 입력한다.

- `release_id`: 승인할 draft UUID
- `confirmation`: 정확히 `PUBLISH`
- `approval_note`: 사람이 확인한 근거

RPC는 한 트랜잭션에서 이전 latest를 해제하고 대상 release만 `published`, `is_latest=true`로 변경한다. 승인 시각, GitHub actor, 승인 메모를 함께 기록한다. 자동수집 workflow에는 이 RPC 호출이 없으며, 자동수집 결과는 계속 draft에 머문다.

현재 2026-09-08 draft는 별도 사용자 승인 전까지 이 절차를 실제 실행하지 않는다.
