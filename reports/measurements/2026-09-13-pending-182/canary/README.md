# HWP parser canary 결과

- canary run ID: `a1a89a3a-0f26-4903-a6fe-1024db372458`
- provenance: `ACTUAL_EXECUTION`
- parser code commit: `2c70186cc1dbbad21fb4ca8b12c5f34baae72924`
- parser: `kodit-hwp-ole 0.1.0`
- engine: `olefile 0.47`
- 표본: 15건 (`NOTICE_UNKNOWN` 3건, `VERIFIED_EXISTS` 12건)
- 표본 크기 범위: 12,800~4,531,712 bytes
- 출처 owner: 서로 다른 15개
- 실행: 각 표본을 같은 environment fingerprint에서 2회
- 결과: 15/15 통과, 실패 0건
- 두 실행의 extract hash 불일치: 0건
- parser code dirty: `false`
- 오류 및 stack trace 발생: 0건
- 결과 JSON SHA-256: `07a25f1b7e22878e810f4dba48807f6767d9ff6c8ed7f0784bd79062dbcd1291`

## 통과 조건

각 표본에서 baseline input SHA-256 일치, OLE/HWP magic 확인, parser 정상 종료,
비어 있지 않은 본문, 규정명 식별, extract hash 생성, 동일 환경 2회 실행의 extract hash
일치를 모두 확인했다.

Canary의 기술적 batch gate는 통과했지만 이 실행에서는 182건 전체 재처리를 수행하지
않았다. 공개상태·residual·인간 검토 trigger·Supabase 데이터도 변경하지 않았다.

상세 표본, 두 실행의 provenance와 결과는 `canary-run.json`에 있다. 원본 HWP와 로컬
절대경로는 저장소에 포함하지 않았다.
