# v0.4 DDL 대비 변경표

| v0.4 논리 구조 | 최초 migration 초안 | 변경 이유 |
|---|---|---|
| 일반·의원실 원본을 `public`에 저장 | 원본을 `core`에 저장하고 `public`은 비움 | Supabase 기본 PostgREST 노출과 기본 ACL로부터 원본을 분리 |
| 사건은 `case` | 사건은 `case` 유지 | 개인정보 경계 유지, `case → core` 참조만 허용 |
| 공개용 스키마 없음 | `api` 추가 | 일반·의원실·내부 allowlist 뷰/RPC만 Data API에 노출 |
| 상태별 DB role 미정 | `core.user_access_profiles`와 `api.has_access()` | `office`·`internal`을 PostgreSQL login role로 만들지 않고 `auth.users`에 연결 |
| RLS/GRANT 구문 없음 | 모든 `core`·`case` 테이블에 RLS ENABLE/FORCE, 브라우저 grant 전부 회수 | 원본 직접조회 차단 |
| Supabase 기본 future grant 미고려 | `public`·`core`·`case`·`api` default privileges 회수 | 이후 생성 객체의 우발적 anon 노출 방지 |
| 일반 뷰가 원본을 직접 조회 | 제한된 SECURITY DEFINER 함수 + `security_invoker` view | 원본 grant 없이 invoker view 요구를 충족 |
| `document_urls.normalized_url` 하나가 문서 hash도 보유 | URL의 UNIQUE 제거 + append-only observation 분리 | 같은 URL의 복수 SHA와 같은 SHA의 복수 URL 보존 |
| HWP 추출 상태만 저장 | 결과 어휘·추출/수동 검증·동일 게시 PDF·단계상승 게이트 추가 | 다운로드·magic·SHA만으로 전문 공개 불가 |
| `status_code` 단독 PK | `(methodology_version, status_code)` 유일키와 별도 UUID PK | 판정기준 버전 병존 |
| 상태 이력에 `valid_to` 갱신 | `supersedes_assignment_id` 기반 append-only | 판정 이력 덮어쓰기 방지 |
| 보증번호·사건 접수번호 평문 | 암호문 + 검색용 SHA-256 fingerprint | 사건 식별정보 평문 저장 방지 |
| Storage 경로만 정의 | private bucket 3개와 internal 정책 초안 | 일반 원문·사건 원문·배포 산출물 분리 |
| `facts.source_type` 누락 | 사실 원장에 `source_type` 필수화 | 출력 시 출처 유형 추적 |
| 공개 결정트리 전용 원장 없음 | 버전형 `publication_decision_rules` 추가 | 방법론별 결정순서와 결과 재현 |
| 배포 승인·변경·철회 필드 부족 | 승인자·승인시각·변경 건수·최신본·철회시각·사유 추가 | 배포 원장과 정정 이력 보강 |

## 의도된 접근 경계

- `anon`: `api.public_*`만 조회
- `authenticated/public`: 일반 공개 API만 조회
- `authenticated/office`: 일반 공개 + 의원실 승인 API
- `authenticated/internal`: 일반 공개 + 의원실 + 작업대 API
- `service_role`: 수집기와 서버 작업에서만 원본 접근
- `case`: PostgREST 미노출, 브라우저용 RPC 없음, `case-documents` Storage 정책 없음

## 실제 접근 테스트 원칙

- service role은 RLS 판정에 사용하지 않고 Auth 사용자·fixture 준비와 정리에만 사용합니다.
- 공개 경로는 publishable key의 anon 역할로 호출합니다.
- 의원실·내부 경로는 실제 Supabase Auth 로그인으로 발급된 JWT로 호출합니다.
- office JWT는 internal API가 거부되는지, 모든 브라우저 역할은 `core`와 `case` 스키마가 406인지 확인합니다.

`supabase/config.toml`의 노출 스키마는 `api`, `graphql_public`만 포함합니다. 이 설정은 migration 적용과 별도로 배포 전에 원격 API 설정에서 다시 확인해야 합니다.
