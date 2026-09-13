# Parser runtime v1.0 reproduction

This read-only run verifies the shared failure taxonomy and fixed runtime across
PDF, OLE/HWP, and HWPX. Earlier measurement ledgers remain unchanged.

Runtime fingerprint:
`e77e6a2dd79ef2342b80787149c451c7facbfccc6969393b5f07340e78ed6a64`

## PDF re-canary

- Run ID: `54e8b6d4-8200-4c52-93ce-31118c18fe37`
- Samples/attempts: 12/24
- Outcomes: 10 `SUCCESS`, 1 `NO_EXTRACTABLE_TEXT`, 0 `ENCRYPTED`, 1 `EXTRACTION_FAILED`
- Previous outcome and extract-hash match: yes
- Reproducibility anomalies: 0
- Failure taxonomy: the failed sample is `DOCUMENT/PDF_READ_FAILED`; all 11 non-failures have empty failure fields
- PDF 1,730-file full batch executed: no
- Ledger SHA-256: `df4812e17097eedd4952d434245b43c83a07ec4efde62244d64189a054c00fb7`

## OLE/HWP full-corpus reproduction

- Run ID: `10a9d5f2-2e21-46c1-bfbe-f5871ed40bef`
- Population/attempts: 326/652
- Classification: 298 identified, 28 identity-unresolved, 0 parse failures, 0 integrity mismatches
- Previous per-document classification/outcome/extract-hash match: yes
- Non-empty failure taxonomy fields: 0 attempts
- Reproducibility anomalies: 0
- Ledger SHA-256: `2f9b737515084d4fd9d78c9e72407394088dd5c40e6b6c27f50e28b94c97c6d0`

## HWPX full-corpus reproduction

- Run ID: `7c2ce504-1f76-4749-8124-4e9e3fad3264`
- Population/attempts: 358/716
- Classification: 353 identified, 5 identity-unresolved, 0 parse failures, 0 integrity mismatches
- Previous per-document classification/outcome/extract-hash match: yes
- Non-empty failure taxonomy fields: 0 attempts
- Reproducibility anomalies: 0
- Ledger SHA-256: `a73e231d1544d11620cc01d7e6730b985cf170dd873039732a9be1363d512df9`

No Supabase, product status, confidence, residual, dispatcher, Ollama,
Discord, or human-review state was changed.
