# PostgREST 노출 스키마 전환 절차

2026-09-05 읽기 전용 실사에서 원격 프로젝트는 `public`, `graphql_public`을 노출하고 있었습니다. 이번 작업은 원격 설정을 변경하지 않습니다.

승인 후 순서는 다음과 같습니다.

1. 대상 프로젝트 ref와 새 KODIT 프로젝트의 URL·publishable key가 일치하는지 확인합니다.
2. 원격 스키마·RLS·GRANT·bucket·migration 이력을 다시 읽기 전용으로 스냅샷합니다.
3. 최초 migration을 적용해 `core`, `case`, `api`와 private bucket을 만듭니다. 이때 `public`은 비어 있고 브라우저 권한이 회수된 상태여야 합니다.
4. Supabase API 설정의 exposed schemas를 `api`, `graphql_public`으로 변경합니다. `public`, `core`, `case`는 제외합니다.
5. 스키마 캐시 재적재 후 `core`와 `case`의 Accept-Profile 요청이 406인지 확인합니다.
6. `remote_access_contract.mjs`로 anon, 일반 JWT, office JWT, internal JWT를 각각 검사합니다.
7. 모든 검사가 통과한 뒤에만 프론트 환경변수에 새 프로젝트 URL과 publishable key를 배포합니다.

실패 시 프론트 배포를 중단하고 API 노출을 유지하지 않습니다. service role은 fixture 준비·정리에만 사용하며 RLS 성공 판정에는 사용하지 않습니다.
