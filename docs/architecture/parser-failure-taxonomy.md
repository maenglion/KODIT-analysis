# Parser failure taxonomy v1.0

Parser outcome and execution failure are separate contracts. Successful parsing,
no extractable text, encryption detection, and identity non-match are outcomes;
they do not populate `failure_domain` or `failure_code`.

| Domain | Code | Meaning |
| --- | --- | --- |
| `ENVIRONMENT` | `DEPENDENCY_IMPORT_FAILED` | Installed metadata may exist, but the parser module is not importable. |
| `ENVIRONMENT` | `RUNTIME_CONTRACT_FAILED` | Python or locked dependency versions violate runtime v1.0. |
| `INPUT_INTEGRITY` | `SHA256_MISMATCH` | Preserved bytes do not match the baseline digest. |
| `INPUT_INTEGRITY` | `MAGIC_MISMATCH` | Bytes are not the format selected for the runner. |
| `DOCUMENT` | `PARSE_FAILED` | The selected parser cannot read the document structure. |
| `DOCUMENT` | `PDF_READ_FAILED` | pypdf reports a PDF read error. |
| `DOCUMENT` | `PDF_STRUCTURE_INVALID` | PDF structure setup or page enumeration fails. |
| `EXTRACTION` | `TEXT_EXTRACTION_FAILED` | Document opened, but text extraction raised an error. |

The legacy `failure_layer` field remains as a compatibility alias of
`failure_domain`. New consumers must use the domain/code pair. `SUCCESS`,
`NO_EXTRACTABLE_TEXT`, `ENCRYPTED`, and `IDENTITY_NOT_FOUND` leave both fields
empty. Runtime-v1 reproduction creates new provenance ledgers and never edits
the earlier corpus measurements.
