# Strict PDF full-corpus runtime-v1 measurement

- Batch run ID: `0c28562a-0e8e-47ae-bcea-f77ba1c6ce08`
- Provenance: `ACTUAL_EXECUTION`
- Parser: `kodit-pdf-pypdf 0.1.0`
- Population: 1,730 strict PDFs
- Attempts: 3,460 (two per input)
- State changes performed: no

## Outcomes

| Outcome | Documents |
| --- | ---: |
| `SUCCESS` | 1,719 |
| `NO_EXTRACTABLE_TEXT` | 1 |
| `ENCRYPTED` | 0 |
| `EXTRACTION_FAILED` | 10 |
| `INPUT_INTEGRITY_MISMATCH` | 0 |

All ten failures are `DOCUMENT/PDF_READ_FAILED`. Non-failure outcomes have empty
failure taxonomy fields. No OCR, identity evaluation, download retry, or state
transition was performed.

## Metric distributions

These values are observations, not classification thresholds.

| Metric | Min | P25 | Median | P75 | P95 | Max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Page count | 0 | 1 | 1 | 1 | 1 | 62 |
| Extracted characters | 0 | 406 | 457.5 | 513 | 687.2 | 50,599 |
| Replacement-character ratio | 0 | 0 | 0 | 0 | 0 | 0 |
| Hangul ratio | 0 | 0.541053 | 0.574210 | 0.631044 | 0.699163 | 0.884471 |
| Pages with text | 0 | 1 | 1 | 1 | 1 | 62 |
| Pages without text | 0 | 0 | 0 | 0 | 0 | 1 |

## Guardrails

- Nondeterministic results: 0
- Extract-hash reproducibility anomalies: 0
- Input SHA or magic mismatches: 0
- Runtime/environment mismatches: 0
- Parser or batch runner dirty: no
- Guardrail violations: none
- Ledger SHA-256: `15730562df6d43f917c88aabd15b2c234d2a7f6517aae7d745862af2904fc8b4`

## Interpretation boundary

This ledger describes individual PDF representations only. A PDF outcome does
not directly determine a regulation version's availability or confidence. When
official PDF/HWP/HWPX attachments are verified as equivalent representations,
verified full text from any one member can satisfy the regulation-version
full-text gate. Therefore `NO_EXTRACTABLE_TEXT` and `EXTRACTION_FAILED` here do
not reduce publication status and do not create residuals or human-review work.

No Supabase, publication status, confidence, residual, OCR, re-collection,
human trigger, production dispatcher, Ollama, or Discord operation occurred.
