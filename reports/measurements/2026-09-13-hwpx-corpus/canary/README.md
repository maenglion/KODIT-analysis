# HWPX real-corpus canary

- Canary type: `HWPX_CANARY`
- Run ID: `653467be-9007-4cb3-bd10-9ff32926fe09`
- Provenance: `ACTUAL_EXECUTION`
- Parser: `kodit-hwpx-zipxml 0.1.0`
- Parser code commit: `b02a8e349d00899f247d070d6d785c7796ca7498`
- Result: `PASSED`
- Samples: 5/5 passed
- Attempts: 10 (two executions per sample)
- Environment fingerprints: 1
- Non-deterministic extract hashes: 0
- Parser failures: 0
- State changes performed: no

## Sample composition

The canary is separate from the completed OLE/HWP canary. It contains three
KODIT files and two ALIO files with different owners and sizes. One ALIO file
has a `.hwp` suffix but is classified as `ZIP_HWPX` from its bytes and required
internal package structure; the file extension is not used as the format
authority.

All samples satisfied the following contract twice in the same environment:

1. Input SHA-256 matched the archived baseline.
2. Magic and required package members identified a strict HWPX document.
3. The parser completed successfully and extracted non-empty text.
4. The regulation name or a registered alias was found using the shared
   HWP/HWPX identity normalization rule.
5. Both executions produced the same extract hash.
6. Full execution provenance was recorded and parser source was clean.

## Integrity

- Result ledger: `canary-run.json`
- Result ledger SHA-256: `684a47ce404aa567918e7d8625d5de0489eab71423075c6d955fe3cb39c25abe`
- Canary plan SHA-256: `0900da5a5277fa042ea119ba5afb11e8a5645a929766f7ad8a2fd35ad2ba373b`
- Corpus measurement SHA-256: `25a83095cf13f93afbf3a11457a078136637534ce8f0e794955a5432f9730411`

The ledger contains relative corpus paths only. No Supabase data, status,
confidence, residual, Ollama, Discord, or production dispatcher operation was
performed.
