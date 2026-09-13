# HWPX full-corpus batch measurement

- Batch type: `HWPX_FULL_CORPUS_MEASUREMENT`
- Batch run ID: `20035730-638b-41be-8926-642db6871f26`
- Provenance: `ACTUAL_EXECUTION`
- Parser: `kodit-hwpx-zipxml 0.1.0`
- Batch runner commit: `5d4f4c0b5b8c20cb1dd80025cf9c6b87d010f7e9`
- Population: 358 strict HWPX documents
- Attempts: 716 (two executions per document)
- Environment fingerprints: 1
- Result ledger SHA-256: `5aeb1efb507fbdeea7a884ca3e412a7a038ae777ec3bd41e2e879962dbf82716`
- State changes performed: no

## Classification

| Classification | Count |
| --- | ---: |
| `PARSE_OK_AND_IDENTIFIED` | 353 |
| `PARSE_OK_IDENTITY_UNRESOLVED` | 5 |
| `PARSE_FAILED` | 0 |
| `INPUT_INTEGRITY_MISMATCH` | 0 |

The four ALIO documents and 349 of 354 KODIT documents were extracted and
identified. All 358 inputs parsed successfully; the five unresolved results
are identity-layer findings, not parser failures.

## Identity residual candidates

- Four KODIT attachments have no attachment-key identity reference in the
  preserved `rule_mentions` baseline. They remain
  `IDENTITY_REFERENCE_MISSING` candidates rather than receiving an identity
  inferred from their filename.
- One KODIT attachment has a linked identity, but its extracted document text
  contains a shortened/typo form of the registered regulation name. It remains
  an `IDENTITY_TEXT_MISMATCH` candidate. The parser did not silently normalize
  this substantive missing text.

These five candidates require later identity/source evaluation. No residual
record was created or resolved by this batch.

## Guardrails and reproducibility

- Failure signatures: none
- Extract-hash reproducibility anomalies: 0
- Input SHA or strict HWPX structure mismatches: 0
- Parser/environment contract mismatches: 0
- Dirty parser executions: 0
- Dirty batch runner: no
- Guardrail violations: none

The result ledger stores only relative corpus paths and extracted-text hashes;
it does not store extracted document text or absolute local paths. No
Supabase, public status, confidence, residual, production dispatcher, Ollama,
Discord, or human-review operation was performed.
