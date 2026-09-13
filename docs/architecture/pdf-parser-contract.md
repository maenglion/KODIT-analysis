# PDF parser contract v0.1

`kodit-pdf-pypdf 0.1.0` determines only whether a strict PDF can be read and
whether machine-extractable text exists. It does not determine regulation
identity, public status, confidence, or OCR policy.

## Outcomes

- `SUCCESS`: strict PDF, readable structure, not encrypted, and non-empty
  extracted text.
- `NO_EXTRACTABLE_TEXT`: readable PDF with pages but no extracted text.
- `ENCRYPTED`: pypdf reports the document as encrypted.
- `EXTRACTION_FAILED`: input integrity, runtime-contract, or parser exception;
  `failure_layer` and the sanitized exception fields distinguish the cause.

No replacement-character or Hangul-ratio threshold is set in v0.1. Those
values are observations for corpus analysis. Empty text is never `SUCCESS`.

Page image counts are deferred. pypdf image enumeration may decode image
objects and its cost/behavior varies by PDF encoding; v0.1 records page and
text measurements first rather than creating an unvalidated image policy.

## Parser versus identity

The PDF runner emits an extraction hash and metrics but no identity result.
Identity will be evaluated by a separate shared evaluator after parsing.

The currently preserved identity candidates remain unchanged:

- HWP: 28
- HWPX: 5
- Total: 33
- Reference missing: 21
- Text mismatch: 12

Future reference analysis may split `REFERENCE_MISSING` into:

- `REFERENCE_MISSING_KEY_GAP`: the document/post exists but internal
  attachment-key linkage is absent.
- `REFERENCE_MISSING_TRUE`: no supporting reference exists.

This task does not execute that split or modify any residual ledger.
