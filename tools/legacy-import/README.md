# legacy-import

0811·0831 자료는 수정하거나 복사하지 않고 SHA-256 기반 legacy snapshot으로 등록합니다.
`regenerate_v04.py`는 기존 판정값을 비교 열에만 보존하고, 원문·공식 발견경로·추출 결과를 v0.4 결정트리에 다시 통과시켜 검토 대기 산출물을 만듭니다.

```powershell
python tools/legacy-import/regenerate_v04.py --output-dir outputs/<run-id> --emit-db-sql <temp.sql>
node tools/legacy-import/build_release_workbook.mjs outputs/<run-id>/workbook-input.json outputs/<run-id>/kodit_regulation_status_latest.xlsx
```

원본 snapshot, 다운로드 파일, 사건 자료, 자격증명은 Git에 포함하지 않습니다. 생성 SQL은 `core.releases.status='draft'`, 주장 `visibility='internal'`만 사용하며 공개 release를 승격하지 않습니다.
