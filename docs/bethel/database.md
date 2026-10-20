# 비공개 DB 구성

## 준비 상태

추가 전용 테이블 7개를 만드는 SQL은 `supabase/migrations/20261020000100_bethel_private_correspondence.sql`에 있습니다. 기존 공개 규정 테이블과 API는 변경하지 않습니다. 사용자 요청에 따라 원격 DB 적용은 추후로 보류합니다. 최초 연결 점검에서는 Supabase CLI 로그인 역할 초기화에서 HTTP 403이 발생했으며 **원격 적용·입력·원격 검증은 수행하지 못했습니다**. 로컬 SQL 준비를 원격 DB 구축 완료로 표시하지 않습니다.

| 테이블 | 기록 |
|---|---|
| `case.bethel_documents` | 문서 ID·원본 SHA-256·파일 종류·반입 근거 |
| `case.bethel_extractions` | 페이지/문단별 native text·별도 OCR·파서 실행 증빙 |
| `case.bethel_correspondence` | 발신·수신·정보주체·문서일·유형·청구/회신·차수·발송/도달 확인·접수번호 |
| `case.bethel_evidence` | 발언자·본문 역할·원문 위치·기재 내용·해석 수준·이미지 대조 여부 |
| `case.bethel_questions` | 3단계 질의·담당기관·근거 연결·제출/회신 상태 |
| `case.bethel_response_items` | 질문별 구체답변·부분답변·종전원용·제한·범위밖·정정·부존재와 매칭 근거 |
| `case.bethel_relations` | 답변 대상·정정·동일내용 후보·초안/첨부 관계 |

모든 테이블에 RLS를 활성화하고 PUBLIC·anon·authenticated의 접근권한을 부여하지 않습니다. 서버의 service_role만 SELECT/INSERT/UPDATE하도록 합니다. `case`를 PostgREST 노출 스키마에 추가하지 않습니다. 일반 로그인 사용자가 직접 읽는 UI나 공동 검토자의 접근계정은 아직 구성하지 않았습니다. 원본 binary는 자동 업로드하지 않으며 `original_storage_key`는 별도 보관소가 준비되기 전까지 NULL입니다.

## 적용 순서

1. 기존 연결 프로젝트와 사용 계정의 SQL 권한을 복구하고 대상 프로젝트를 확인합니다. 비밀키를 채팅이나 GitHub에 올리지 않습니다.
2. 위 migration 파일 하나를 검토하여 DB에 적용합니다. 다른 미적용 migration까지 일괄 실행하지 않습니다.
3. 비공개 `private-data/bethel/import.sql`을 적용합니다. 입력 SQL에는 개인정보와 원문이 포함되어 있으므로 공개 저장소에 올리지 않습니다.
4. 아래 검증을 관리자 SQL 연결에서 실행합니다. 문서 개수는 이번 처리 현황과 같아야 합니다.

```sql
select count(*) from "case".bethel_documents;
select parse_status, count(*) from "case".bethel_documents group by 1;
select count(*) from "case".bethel_extractions;
select count(*) from "case".bethel_correspondence;
select count(*) from "case".bethel_evidence;
select count(*) from "case".bethel_questions;
select count(*) from "case".bethel_response_items;
select c.relname, c.relrowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='case' and c.relname like 'bethel_%';
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema='case' and table_name like 'bethel_%'
and grantee in ('PUBLIC','anon','authenticated'); -- 0 rows expected
```

## 차수와 동일성 규칙

- 바이너리 SHA-256이 같으면 하나의 문서와 여러 경로(alias)로 기록합니다.
- 내용이 비슷해도 해시가 다르면 별도 문서이며 검토 전 병합하지 않습니다.
- `round_claimed`는 문면/파일명상의 차수, `round_confirmed`는 발신자×수신기관×절차×실제 발송·접수 대조를 마친 차수입니다.
- 초안 날짜·파일 수정일·‘최종’이라는 이름은 발송·도달의 증명이 아닙니다.
- 원문 회신에 반복 인용된 청구내용과 기관의 실제 답변을 근거 기록에서 구분합니다.
- 회신의 법적 견해를 검증된 사실로 승격하지 않습니다. OCR도 native text로 덮어쓰지 않습니다.
