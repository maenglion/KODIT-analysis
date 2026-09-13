# OLE/HWP full-corpus batch measurement

- Batch type: `OLE_HWP_FULL_CORPUS_MEASUREMENT`
- Valid batch run ID: `be0529eb-0592-4489-b9ba-b3fe25d35ae7`
- Provenance: `ACTUAL_EXECUTION`
- Parser: `kodit-hwp-ole 0.1.1`
- Engine: `olefile 0.47`
- Batch runner commit: `a490a2e91683c63fe932cf495cf8992490d2baae`
- Population: 326 strict OLE/HWP documents
- Attempts: 652 (two executions per document)
- Environment fingerprint: `8472c691d5f144ef696e95a032079df8e3c177d4e2109200742b90b12e4b9c87`
- State changes performed: no

## Valid run classification

| Classification | Count |
| --- | ---: |
| `PARSE_OK_AND_IDENTIFIED` | 298 |
| `PARSE_OK_IDENTITY_UNRESOLVED` | 28 |
| `PARSE_FAILED` | 0 |
| `INPUT_INTEGRITY_MISMATCH` | 0 |

All 326 inputs passed the parser layer. The 28 unresolved results are identity
findings: 17 have no preserved attachment-key identity reference and 11 have
a reference that does not match the extracted text under the conservative
shared normalization rule. No identity was inferred from a filename.

## Relationship to the previous 182 measurement

The full corpus contains the previous 182 documents plus 144 additional OLE
documents. All 182 previous outcomes reproduced exactly:

- 180 remained `PARSE_OK_AND_IDENTIFIED`.
- 2 remained `PARSE_OK_IDENTITY_UNRESOLVED`.

Of the additional 144 documents, 118 were parsed and identified and 26 moved
to the identity layer. The full corpus contains 182 ALIO and 144 KODIT files.

## Environment guardrail history

Two execution-environment failures occurred before the valid run and are
preserved separately rather than overwritten:

1. `batch-system-python-missing-dependency.json`: system Python could not
   import `olefile`; all 652 attempts recorded `RuntimeError:olefile import
   failed`.
2. `batch-preserved-pydeps-incomplete.json`: the archived dependency directory
   contained package metadata but no importable module; all attempts recorded
   `RuntimeError:olefile.OleFileIO is unavailable`.
3. `batch-run.json`: a clean temporary installation of the lock-pinned
   `olefile 0.47` restored the same environment fingerprint as the original
   HWP canary and produced the valid corpus measurement above.

The first two runs are environment-provenance evidence, not document parser
failures.

## Integrity

- Valid result ledger SHA-256: `3aefa71ffa00d68982971c8813a269d115c63539b70f37ed60223683beea59b2`
- Missing-dependency run SHA-256: `3faf8ccc609b361f1f190e4b57751643041a3b3232abe206b527876e7e8d8fd7`
- Incomplete-pydeps run SHA-256: `abee0acf4a6ee0fe80ed42ad13f5756f373d0773fbc8e6df829879285326e0c5`
- Failure signatures in valid run: none
- Extract-hash reproducibility anomalies: 0
- Parser/environment contract mismatches: 0
- Input integrity mismatches: 0
- Guardrail violations in valid run: none

The ledgers contain no extracted text or absolute local paths. No Supabase,
status, confidence, residual, dispatcher, Ollama, Discord, or human-trigger
operation was performed.
