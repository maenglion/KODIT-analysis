# Real PDF canary

- Canary type: `PDF_CANARY`
- Canary run ID: `2874f38d-3c36-4b30-8a0e-182e8e93e8dc`
- Provenance: `ACTUAL_EXECUTION`
- Parser: `kodit-pdf-pypdf 0.1.0`
- Parser engine: `pypdf 6.0.0`
- Parser commit: `a0e7aafd8a6796dd128883a4a1e394b5fdd5dd98`
- Samples: 12/12 passed the deterministic classification gate
- Attempts: 24 (two executions per sample)
- ALIO/KODIT: 6/6, all from distinct source owners
- Size range: 35,330 to 995,300 bytes
- File-year tokens represented: 2024, 2025, 2026
- State changes performed: no

## Outcomes

| Outcome | Documents |
| --- | ---: |
| `SUCCESS` | 10 |
| `NO_EXTRACTABLE_TEXT` | 1 |
| `ENCRYPTED` | 0 |
| `EXTRACTION_FAILED` | 1 |

The no-text document has one readable page and no machine-extractable text.
It is not automatically labeled OCR-required. The failed document reproduced
its prior `PdfReadError` twice with the same error and sanitized traceback.
That deterministic classification satisfies the canary contract; it does not
claim that the document was successfully extracted.

## Quality observations

Across the ten `SUCCESS` documents:

| Metric | Minimum | Median | Maximum |
| --- | ---: | ---: | ---: |
| Page count | 1 | 3.5 | 45 |
| Extracted characters | 189 | 2,660 | 36,158 |
| Replacement-character ratio | 0 | 0 | 0 |
| Hangul ratio | 0 | 0.708700431433 | 0.884471273938 |
| Pages with text | 1 | 3.5 | 45 |
| Pages without text | 0 | 0 | 0 |

No quality threshold is established from these observations.

## Gate results

- Input SHA mismatches: 0
- Wrong magic: 0
- Runtime manifest mismatch: 0
- Environment fingerprints: 1
- Parser dirty executions: 0
- Result/extract-hash reproducibility anomalies: 0
- Absolute local path exposure: 0
- Credential exposure: 0

Plan SHA-256:
`fe9c0d0e9a1ce54b58bbdc2923217ee54757332cf1c9101802d1be62c9240efe`

Canary ledger SHA-256:
`a0eef10dde02e59e629251743d4866f56a01dc8c731e42495127c54c9ec16d6e`

`full_batch_authorized` remains `false`. The 1,730-file PDF batch requires a
separate user approval.
