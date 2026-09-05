# collector

크롤링, 파일 식별, HWP/HWPX 추출과 10일 재검증 작업을 둡니다.

기존 저장소에서는 수집기 코드만 검토 후 선별 이식합니다. 기존 데이터·출력물·사이트 코드는 복사하지 않습니다.

HWP 계열 결과는 `success`, `unsupported_format`, `drm`, `failed`, `skipped_twin_pdf`로 기록합니다. 실패는 `EXTRACTION_PENDING`으로 남기며 다운로드·magic bytes·SHA만으로 전문 공개를 요청하지 않습니다.
