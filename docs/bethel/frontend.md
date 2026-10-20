# 비공개 근거 작업실

[벧엘 근거 작업실 열기](https://bethel-evidence.maengnanyoung.chatgpt.site)

로그인한 소유자에게만 허용한 비공개 사이트입니다. 원문이나 API를 일반 공개하지 않습니다. 다른 이용자의 초대는 보류 상태입니다.

첫 화면에서 법원행정처와 개인정보보호위원회 근거 묶음을 선택합니다. 근거별 원문 페이지/추출문 확인, 질문·회신 19개 항목 비교, 90개 문서 검색, 선택한 근거와 메모의 JSON·Markdown 내보내기를 제공합니다.

## AI가 읽는 방법

- 즉시 공통 사용: 사이트에서 근거 묶음 JSON을 내려받아 사용하는 AI에 첨부합니다. 근거 ID·문서 해시·원문 위치·주장 수준·미확인 사항을 함께 제공합니다.
- 원격 MCP: `https://bethel-evidence.maengnanyoung.chatgpt.site/mcp`
- 읽기 전용 API 명세: `https://bethel-evidence.maengnanyoung.chatgpt.site/api/manifest`
- 원격 MCP 도구: `search_evidence`, `get_document`, `get_submission_pack`, `list_evidence`

MCP에는 사용자 OAuth 인증과 사이트 열람 권한이 필요합니다. URL만으로 접근할 수 없습니다. 사이트용 서비스 접근과 MCP용 OAuth 연결은 다릅니다. 각 외부 AI 클라이언트의 실제 연결은 해당 클라이언트의 인증 지원에 따라 별도로 확인합니다. Sites가 만든 개인 플러그인은 설치 상태가 확인되었지만, 이 작업에서는 외부 AI별 OAuth 연결을 완료했다고 주장하지 않습니다.

## 이번 버전의 범위

2026-10-20 자료 스냅샷입니다. 원문 90개와 native/OCR 추출을 사이트에 함께 배포했습니다. 선택과 메모는 현재 브라우저 저장이며 기기 간 동기화하지 않습니다. 새 문서 자동 반영, 공동 편집, Supabase 적용은 아직 하지 않았습니다. 새 문서는 원장 갱신·검증 후 같은 주소에 재배포할 수 있습니다.

타입 검사, 빌드, 두 제출 묶음의 출처 연결, OCR 공백 검색, 원문 SHA-256, 로컬 MCP 요청과 실제 배포 화면을 확인했습니다. 기관 제출 기능은 없으며 화면과 내보내기는 미제출 검토 초안입니다.
