# HWP 182건 전체 재처리 결과

- batch run ID: `332f4a35-1534-4e2f-93fb-60138080cc14`
- provenance: `ACTUAL_EXECUTION`
- 기준 canary run ID: `0a9cda64-a057-4621-9eaa-27bc2c75cda4`
- 실행 시 parser code commit: `9afdaffb8f56114e52e34a461fc2caa86bcfb701`
- 전체 입력: 182건
- 실행 횟수: 364회(입력별 동일 환경 2회)
- environment fingerprint: 1개
- parser code dirty: `false`
- 결과 JSON SHA-256: `8213b8fb3c8714b872ede8e1f4cc19a830e47ebbe88473f61a6662c5a12b2d67`

## 분류 결과

| 분류 | 건수 |
|---|---:|
| `PARSE_OK_AND_IDENTIFIED` | 180 |
| `PARSE_OK_IDENTITY_UNRESOLVED` | 2 |
| `PARSE_FAILED` | 0 |
| `INPUT_INTEGRITY_MISMATCH` | 0 |

- failure signature: 없음
- extract hash 재현성 이상: 0건
- parser/environment 계약 변경: 0건
- 기존 `PARSER_RESIDUAL` 해소 후보: 180건
- 신규 `IDENTITY_RESIDUAL` 후보: 2건
- 자동 후속처리 차단 조건: 없음

## 동일성 미해결 2건

| 등록 규정명 | 추출 본문 표제 | 판정 |
|---|---|---|
| 문화산업완성보증계정 운영요령 | 문화산업보증계정 운영요령 | `IDENTITY_RESIDUAL` 후보 |
| 문화산업완성보증 업무방법서 | 문화산업보증 업무방법서 | `IDENTITY_RESIDUAL` 후보 |

두 문서는 파싱과 두 실행의 extract hash 재현에는 성공했지만 등록 규정명과 본문 표제가
다르다. 별칭 또는 명칭 변경으로 자동 확정하지 않고 동일성 재평가 대상으로만 기록한다.

## 사전예고 근거 축

- `NOTICE_UNKNOWN` 37건: 전부 `PARSE_OK_AND_IDENTIFIED`
- `VERIFIED_EXISTS` 145건: 143건 식별, 2건 동일성 미해결

본문 파싱 성공은 사전예고 근거 상태를 바꾸지 않는다. `NOTICE_UNKNOWN` 37건은 별도
읽기 전용 측정에서 연결정보·첨부 linkage·필드 부족·관찰자료 불완전 여부를 분해한다.

이번 batch는 측정 실행이다. Supabase, 공개상태, 신뢰도, residual 상태, 인간 검토
trigger를 변경하지 않았고 Ollama도 실행하지 않았다. 상세 실행 provenance는
`batch-run.json`에 있으며 원본 HWP와 로컬 절대경로는 저장소에 포함하지 않았다.
