# KODIT Analysis

KODIT 규정·문서·사실·판정 이력을 수집하고, 일반 공개·의원실·내부 작업대에 서로 다른 허용 범위를 제공하는 모노레포입니다.

## 경계

- `public` PostgreSQL 스키마에는 사용자 테이블을 만들지 않습니다.
- 원본 데이터는 `core`, 사건·개인정보는 `case`, Data API 허용 표면은 `api`에 둡니다.
- PostgREST에는 `api`와 `graphql_public`만 노출합니다.
- 브라우저 앱은 `core` 또는 `case`를 직접 조회하지 않습니다.
- HWP/HWPX 다운로드·매직바이트·해시 확인만으로 전문 공개를 판정하지 않습니다.
- 기존 정적 사이트, K-DATA 사건 화면, 기존 출력물과 하드코딩 데이터는 이 저장소로 복사하지 않습니다.

현재 단계의 SQL은 검토용 초안이며 원격 Supabase에 적용되지 않았습니다.

- 물리 경계: `docs/architecture/schema-boundaries.md`
- PostgREST 전환: `docs/operations/postgrest-cutover.md`
- 정적 계약 검사: `npm run check:schema`
- 실제 Auth/RLS 검사: `npm run test:remote-access` (원격 적용 승인 후)
