# 문서 처리 현황

## 처리 범위

직접 지정된 19개 파일은 모두 존재합니다. 같은 수신 폴더에서 확인한 관련 회신·청구 수정본, 삼일의 준비/참고서면 2개와 감정서 첫 면 이미지까지 대조했습니다. 117개 파일 경로 중 바이너리 중복 27개를 묶어 **90개 문서**로 기록했습니다. ‘90개’는 회신 건수나 실제 발송한 청구 횟수가 아닙니다.

| 형식 | 서로 다른 문서 수 | 처리 |
|---|---:|---|
| PDF | 39 | 기존 KODIT 감사 파서 실행. native text 추출 23, 텍스트 없는 스캔 16 |
| DOCX | 36 | OOXML 본문/표/머리글·꼬리글의 문단별 텍스트. 페이지 번호를 만들어 붙이지 않음 |
| Markdown | 10 | 행 번호별 추출. 전사·정리문을 기관 원문과 구분 |
| EML | 4 | 메일 헤더와 plain text 본문. 인용된 과거 메일은 독립 발송 증거로 자동 처리하지 않음 |
| PNG | 1 | 감정서 첫 면 OCR과 시각 대조 |

스캔본 외에 법원 제출 워터마크만 텍스트로 들어 있는 PDF와 본문 일부만 읽히는 혼합 PDF를 검사했습니다. 총 **24개 문서 121면/이미지**를 Windows 한국어 OCR로 보완했습니다. OCR 빈 페이지는 봉투·백지 여부까지 확인이 필요합니다. 손글씨·도장·숫자·사업자번호는 OCR 정확성을 보장하지 않습니다. 추가된 원고 0415-2의 갑21호증 감정서(p.18–45)를 OCR로 보완했습니다. 기존 Markdown 전사본의 해당 면에는 워터마크만 있어 본문 분석 근거로 쓰지 않았습니다. 원본 의뢰 메일·첨부 ZIP은 아직 미확보입니다.

기존 PDF 파서의 고정 환경은 CPython 3.13.7, pypdf 6.0.0, olefile 0.47입니다. 설치된 pypdf 버전 불일치를 발견해 별도 비공개 runtime 폴더에 고정 버전을 설치했습니다. 최종 39개 PDF 실행은 모두 runtime contract `SATISFIED`입니다. `SUCCESS`는 텍스트 추출 상태이며 주장의 진위나 감정 품질 판정이 아닙니다. 감사 runner의 native 결과와 Windows OCR 결과는 별도 파일로 보존했습니다.

## 보존 자료

비공개 `private-data/bethel`에는 다음이 있습니다.

- `input-manifest.json`: 사용자 지정/추가 발견을 구분한 반입 목록
- `inventory.json`, `aliases.json`, `missing.json`: 문서 SHA-256, 중복경로, 누락 점검
- `documents/BET-…/source.*`: 원본 복사. 제공 파일은 수정하지 않음
- `parser-run.json`, `extraction.json`: 기존 PDF 파서의 감사 실행 기록
- `blocks.json`, `text.txt`: native text와 실제 페이지/OOXML 문단/행 위치
- `ocr-blocks.json`, `ocr-page-*.png`: OCR 추출과 대조용 이미지
- `reviewed-correspondence.json`, `correspondence.csv`: 발신·수신·문서일·유형·차수·발송/도달 확인 원장
- `evidence.json`, `questions.json`: 근거 18개와 질의 8개
- `response-items.json`: 질문·회신 대조 19개 항목과 응답 유형
- `import.sql`: 원격 DB 입력용 SQL. 아직 미적용

본문 메타데이터를 검토한 47개와 추가 검토가 필요한 43개를 명시했습니다. 후자는 주로 여러 청구 초안·다른 포맷·요약·일부 보조 회신이며, 발송본 여부와 회신 매칭은 미확정입니다. 파일명에 ‘최종’이나 차수가 있어도 발송·접수를 추정하지 않았습니다. 모든 문서에 발송·수신 확인 칸을 만들었고, 증빙 확인 전에는 미확인으로 둡니다.

## 재실행

사용자의 기존 파서는 그대로 재사용합니다. PDF 결과를 다른 추출기로 덮어쓰지 않습니다. 입력 manifest 형식은 다음과 같습니다. 절대경로가 담긴 실제 manifest는 커밋하지 않습니다.

```json
[{"path":"<private absolute source path>","basis":"user_provided"}]
```

저장소 루트에서 고정 버전 Python과 격리된 의존성을 사용합니다.

```powershell
$env:PYTHONPATH = (Resolve-Path private-data/runtime).Path
python tools/bethel/parse_correspondence.py --manifest private-data/bethel/input-manifest.json --output private-data/bethel
powershell -NoProfile -ExecutionPolicy Bypass -File tools/bethel/ocr_windows.ps1 -PrivateRoot ((Resolve-Path private-data/bethel).Path)
python tools/bethel/build_review.py --private-root private-data/bethel
```

Windows OCR에는 한국어 OCR 언어팩, PowerShell WinRT 접근 및 Poppler `pdftoppm`이 필요합니다. OCR 산출물이 있는 문서는 재실행 시 건너뜁니다. OCR 설정을 바꿔 재처리할 때에는 새 실행 디렉터리로 보존합니다. 결과 범위·검토 상태는 [기계 판독용 요약](processing-summary.json)에 있습니다.
