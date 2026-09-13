# HWP `ole_error:AttributeError` 표본 진단

- 진단일: 2026-09-13
- 기준 measurement run: `ccdee57b-1a7d-4aa9-ace5-a64671ec5e3a`
- 기준 Git commit: `d7444de282430e2c91aa9a29627000929a0ca573`
- 범위: 182건 전체 재처리가 아닌 크기·개정연도가 다른 대표 HWP 5건
- 외부 HTTP: 사용하지 않음
- 원본 변경: 없음

## 결론

182건이 공유하는 `ole_error:AttributeError`는 단일 공통 근본원인 가설을 강하게
지지하지만, 하나의 근본원인으로 확정할 수는 없다.

선정한 5건은 모두 다음 조건을 충족했다.

- magic bytes: `D0 CF 11 E0 A1 B1 1A E1` (OLE/HWP 계열)
- 보존된 baseline SHA-256과 실제 파일 재계산 SHA-256 일치
- 보존된 legacy extractor와 `olefile 0.47`을 사용한 현재 재현에서 OLE open 성공
- 같은 extractor의 본문 추출 성공

따라서 표본에서는 `FORMAT_MISMATCH`, `DOWNLOAD_OR_FILE_CORRUPTION`,
`DRM_OR_UNSUPPORTED`가 지지되지 않는다. 잠정 분류는
`HISTORICAL_PARSER_EXECUTION_FAILURE / EXECUTION_PROVENANCE_GAP`이다. 파일 자체보다
과거 실행환경·dependency 조합·호출경로 또는 일시적인 runtime 조건이 원인일 가능성이
남아 있지만, 현재 동일 계열 extractor에서 실패가 재현되지 않았다. 실행환경을 고정하지
않고 예외의 클래스명만 저장해 원래 AttributeError의 발생 지점을 소실한 것이 확인 가능한
결함이며, 원래 실패의 세부 원인은 전체 stack trace가 없어 소급 확정할 수 없다.

이 결과만으로 182건 전체가 현재 parser에서 성공한다고 단정하지 않는다. 다음 단계는
parser/runtime metadata와 전체 stack trace를 보존하는 새 실행기로 10~20건 canary를
수행하는 것이다.

## 표본 선정과 결과

| 규정 | 개정 표기 | 바이트 | SHA-256 | magic | 현재 legacy 추출 | 추출 문자 |
|---|---:|---:|---|---|---|---:|
| 경영자문요령 | 2011-11-28 | 12,800 | `efa2980fc9c56957eea3228d4fda9e29690b592b829644b58e7c32771ce7c358` | OLE/HWP | `ok` | 819 |
| 상임임원 복무 등에 관한 요령 | 2024-05 | 58,368 | `a4fcca76d063c24ca5f11febeefa4c419c846d0e25d0fcd19d4de39f28e3dfe5` | OLE/HWP | `ok` | 3,109 |
| 경비기준 | 2025-12-08 | 79,360 | `03d0747ea464d4fbc5295049ddf3f9ff80b7a29716cf4be4e374055481264ec0` | OLE/HWP | `ok` | 14,054 |
| 책임자자격부여기준 | 2025-10-31 | 118,272 | `2e5f128d341d3bef1181486788a841ad24e9d3fb212cf1ea2d198864a1ac41b1` | OLE/HWP | `ok` | 7,924 |
| 기술역량평가시스템 운용기준 | 2026-01-26 | 4,531,712 | `20d005e22d5464a1770700b798a06b3a2ed15ec6660437022042f2e79dda91e2` | OLE/HWP | `ok` | 10,386 |

## 당시 parser 정보의 확인 범위

| 항목 | 확인값 | 판정 |
|---|---|---|
| parser 구현 | `analyze_preannouncements.py::extract_hwp` 사용자 정의 OLE/HWP extractor | 확인 |
| parser name/version | 당시 manifest에 없음 | `UNKNOWN` 유지 |
| dependency | `olefile 0.47` | 보존 dependency에서 확인 |
| parser code commit SHA | 원본 스크립트가 Git 원장 밖에 있어 확인 불가 | `UNKNOWN` |
| 당시 Python/runtime | 실행 manifest에 없음 | `UNKNOWN` |
| 진단 재현 Python | 3.13.7 | 현재 진단값이며 당시 값으로 소급하지 않음 |
| 원래 stack trace | 예외 클래스명만 저장되어 없음 | 복원 불가 |

보존 코드는 `OleFileIO` 생성 과정의 모든 예외를
`ole_error:<ExceptionClass>` 한 줄로 축약한다. 이 때문에 `AttributeError`가 dependency
import/API, OLE directory parsing 또는 다른 내부 지점 중 어디에서 발생했는지 원장만으로
구분할 수 없다.

## 다음 canary의 필수 기록

새 실행기는 적어도 다음을 한 실행 레코드에 남겨야 한다.

- `parser_name`, `parser_version`, `parser_engine`, `engine_version`
- `parser_code_commit_sha`, Python/runtime version, dependency lock hash
- input SHA-256, magic bytes, 파일 크기
- extract SHA-256과 추출 문자 수
- 결과 코드, 오류 타입, 정제된 전체 stack trace
- `executed_at`, `evidence_as_of`, `ACTUAL_EXECUTION`

10~20건 canary에서 같은 처방이 안정적으로 동작하기 전에는 182건 전체 재처리,
residual 종료, 인간 검토 trigger 생성 또는 공개상태 변경을 하지 않는다.
