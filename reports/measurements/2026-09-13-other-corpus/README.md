# OTHER corpus magic/container classification

- Measurement type: `OTHER_MAGIC_CONTAINER_CLASSIFICATION`
- Run ID: `27b322e9-8e8d-4728-8931-909d2dc94ea1`
- Provenance: `ACTUAL_EXECUTION`
- Classifier commit: `a490a2e91683c63fe932cf495cf8992490d2baae`
- Population: 50
- Unknown: 0
- Input integrity mismatches: 0
- Human triggers created: no
- State changes performed: no

## Classification

| Container | `.pdf` suffix | `.hwp` suffix | Total |
| --- | ---: | ---: | ---: |
| `DRMONE_CONTAINER` | 33 | 5 | 38 |
| `FASOO_SECURE_CONTAINER` | 10 | 2 | 12 |
| **Total** | **43** | **7** | **50** |

Every item previously grouped as `OTHER` is a recognized encrypted/secure
container. The extension is not treated as the underlying document format:
none of these 43 `.pdf` files has PDF magic, and none of the seven `.hwp`
files has OLE/HWP magic.

The proposed automatic route for both groups is
`UNSUPPORTED_ENCRYPTED_CONTAINER`. This is a measurement result only; no
residual or human-review trigger was created.

## Integrity

- Result ledger: `classification.json`
- Result ledger SHA-256: `c87bd22b1b35595a1fd7b2a29c1a1d4dabce26ea37b1f036c417dc8612cdc516`
- Classifier source SHA-256: `db04dec5b57ddecf3a06bf456aa57ba3c22bd4fef150893db75d6e1196e66678`

The ledger stores header signature bytes and hashes but no extracted document
text or absolute local paths. PDF runner and production dispatcher behavior
were not changed.
