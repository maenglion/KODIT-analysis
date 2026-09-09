# collector

크롤링, 파일 식별, HWP/HWPX 추출과 10일 재검증 작업을 둡니다.

기존 저장소에서는 수집기 코드만 검토 후 선별 이식합니다. 기존 데이터·출력물·사이트 코드는 복사하지 않습니다.

HWP 계열 결과는 `success`, `unsupported_format`, `drm`, `failed`, `skipped_twin_pdf`로 기록합니다. 실패는 `EXTRACTION_PENDING`으로 남기며 다운로드·magic bytes·SHA만으로 전문 공개를 요청하지 않습니다.

## 공식 규정 PDF 수집기

`collect_regulation.py`는 프로필에 선언한 공식 URL을 정규화하고 임시 디렉터리에 내려받은 뒤 HTTP/MIME/magic bytes, SHA-256, 페이지 수, 암호화 여부와 본문을 검사합니다. 문서는 SHA-256을 기본키로, URL 관찰은 실행별 이력으로 적재하는 SQL을 생성합니다.

한컴 PDF처럼 한글 글리프 매핑이 손상된 문서는 자동으로 통과하지 않습니다. 렌더링한 전 페이지에서 규정명·개정일·조문·부칙·별표·별지를 확인한 경우에만 `--confirm-rendered-anchors`를 명시합니다.

```powershell
python workers/collector/collect_regulation.py `
  --profile workers/collector/profiles/investment_option_guarantee.json `
  --confirm-rendered-anchors `
  --emit-sql "$env:TEMP/kodit-upsert.sql"
```

생성 SQL에는 자격증명이 없으며 DB 적용은 별도 승인·연결 경로에서 수행합니다. 원본 PDF와 추출 중간물은 OS 임시 폴더 밖에 저장하지 않습니다.

## 10일 자동 수집

`scheduled_collection.py`는 매일 실행되는 GitHub Actions에서 DB의 원자적 claim 함수를 먼저 호출합니다. 마지막 성공 완료일부터 10일 전이면 `not_due`, 이미 실행 중이면 `locked`로 정상 종료합니다.

기한이 지난 경우 신보 사전예고·ALIO·상품/업무 페이지와 검토본의 공식 원문 URL을 점검합니다. 변경은 draft release와 `grok`부터 시작하는 검증대기 항목으로만 기록하며, `published` 또는 `is_latest`로 자동 승격하지 않습니다. HWP/HWPX는 다운로드·magic bytes·SHA만으로 전문 공개 상태를 올리지 않습니다.
