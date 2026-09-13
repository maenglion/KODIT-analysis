# Regulation-version availability contract

## Decision unit

`FULLTEXT_PUBLIC` is decided for a `regulation_version`, not for an individual
file. PDF, HWP, HWPX, and an official page's HTML body are representations of
the content. Their extraction outcomes are technical metadata and cannot by
themselves lower availability or confidence.

The full-text gate is an OR condition:

```text
verified official PDF full text
OR verified official HWP full text
OR verified official HWPX full text
OR verified official HTML body full text
= FULLTEXT_PUBLIC gate PASS
```

One verified official representation is sufficient. Multiple formats are not
required, and multiple successful representations do not add points to the
same gate.

## Three independent decisions

```text
availability decision
!= representation-equivalence decision
!= OCR-necessity decision
```

Availability can pass before sibling formats are proven equivalent. Equivalence
organizes representations of the same version and helps choose a preferred
machine-readable source. OCR is considered only when no machine-readable
representation exists; it is not required to establish availability.

For example, an official HWPX with verified full text can establish
`FULLTEXT_PUBLIC` even when a PDF on the same post is unreadable and has not yet
been grouped with the HWPX.

## Representation grouping

The following combination may create a `SAME_VERSION_REPRESENTATION` automatic
grouping candidate:

```text
same post_id
+ same posted_date
+ same normalized regulation title
+ different distribution format
+ no conflicting role marker
```

Automatic grouping must be blocked when a title or attachment role indicates
materially different content, including:

- 신구조문대비표
- 개정안
- 요약본
- 별표 or 별지 as a separate attachment role
- 설명자료
- 의견서
- 사전예고문

Grouping provenance and the evidence used must be retained. The relationship
must not be represented as `covered_by_hwp`, because no representation covers
or rescues another for publication purposes.

## File-level outcomes

`SUCCESS`, `NO_EXTRACTABLE_TEXT`, `ENCRYPTED`, and `EXTRACTION_FAILED` remain
representation-level outcomes. Failure taxonomy remains execution-level
diagnostic data. Neither is a direct availability downgrade rule.

Current measurement records must be distinguished:

- Runtime-v1 PDF re-canary: one `NO_EXTRACTABLE_TEXT` and one
  `DOCUMENT/PDF_READ_FAILED`.
- Legacy corpus observations: ten `pdf_error:PdfReadError` observations.
- Runtime-v1 PDF full-corpus run: one `NO_EXTRACTABLE_TEXT` and ten
  `DOCUMENT/PDF_READ_FAILED` results.

These records have separate provenance even where their counts coincide.
