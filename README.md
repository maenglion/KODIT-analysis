# KODIT Analysis

신용보증기금의 공개 규정·사규예고·공식 근거문서를 수집하고, 출처와 변환 이력을 보존한 상태에서 공개 현황과 변경 관계를 재현 가능하게 분석하는 프로젝트입니다.

이 저장소의 공개 목적은 다음과 같습니다.

- 흩어진 공식 원문과 사규예고를 한곳에서 탐색할 수 있게 합니다.
- 파일 형식과 무관하게 규정 버전 단위의 공개 현황을 확인합니다.
- 수집, 파싱, 동일성 판단 및 파생 분석의 근거를 재현 가능하게 보존합니다.
- 자동 판정으로 확정할 수 없는 항목은 잔차 원장에 남겨 관측값과 추론을 구분합니다.

저장소에 등장하는 업무 주제 코드는 공개 문서의 내용 분류를 위한 분석 범주이며 특정 활용 목적, 법적 판단 또는 개인에 대한 평가를 의미하지 않습니다.

## 구성

- `apps/public-site`: 승인된 공개 read model을 조회하는 웹 애플리케이션
- `apps/office-portal`: 제한된 배포자료를 위한 인증 사용자 화면
- `apps/workbench`: 수집·검증·승격을 위한 내부 작업 화면
- `workers/collector`: 공개 자료 수집기
- `tools`: projection, parser, 검증 및 재현 스크립트
- `supabase/migrations`: additive 데이터 원장과 공개 read contract
- `reports/measurements`: 실행별 측정 결과와 검증 보고서
- `docs/architecture`: 장기적으로 유지할 의미 계약과 설계 결정

## 데이터 경계

- 브라우저는 승인된 공개 RPC만 사용하며 원장 테이블을 직접 조회하지 않습니다.
- 원본·실행 provenance는 `core`, 보호가 필요한 기록은 제한 스키마에 둡니다.
- 공개 화면에는 개인 식별정보, 비밀값, 내부 검토 메모를 투영하지 않습니다.
- 문서의 SHA-256은 binary identity, `extract_hash`는 추출 text identity를 나타냅니다.
- 파일별 추출 결과와 규정 버전의 공개 여부를 별도 축으로 관리합니다.
- 관측값, 파생값, 추론 결과를 서로 다른 원장과 계약으로 구분합니다.

자세한 접근 경계는 [`docs/architecture/schema-boundaries.md`](docs/architecture/schema-boundaries.md)를 참고합니다.

## 결정 기록과 worklog

README에는 현재 공개 목적과 진입점만 유지합니다. 장기 의미 계약과 작업 결정은 [`docs/architecture/README.md`](docs/architecture/README.md)에서 색인하며, 실제 실행 결과는 `reports/measurements`에 immutable artifact로 보존합니다.

결정과 구현은 다음 경로로 추적합니다.

1. 의미·identity·versioning 계약: `docs/architecture`
2. 스키마 변경: `supabase/migrations`
3. 재현 가능한 실행 로직: `tools` 및 `workers`
4. 측정 결과: `reports/measurements`
5. 최종 변경 이력: Git commit

채팅 기록이나 임시 메모는 정본으로 취급하지 않습니다.

## 검증

```bash
pnpm install
pnpm check
pnpm test
```

주요 계약 검사는 루트 `package.json`의 `check:*` 스크립트로 실행합니다. 원격 검사는 로컬 또는 배포 환경에 이미 설정된 자격증명을 런타임에만 사용하며, 비밀값과 `.env.local`은 커밋하지 않습니다.

## 공개 저장소 원칙

- 공식 공개자료와 재현 가능한 파생 artifact만 커밋합니다.
- 개인정보와 내부 전용 기록은 공개 projection 및 예제에서 제외하거나 마스킹합니다.
- 비밀키, DB 접속 문자열, 토큰 및 로컬 절대경로를 커밋하지 않습니다.
- 오류와 미확정 항목은 삭제하거나 확정값으로 꾸미지 않고 잔차 또는 측정 결과로 남깁니다.
- 공개 문서의 실제 규정명과 주제어는 출처 재현을 위해 임의로 변경하지 않습니다.
