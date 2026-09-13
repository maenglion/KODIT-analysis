# Strict PDF corpus identification

- Measurement run ID: `1039b3b9-92a2-427d-9265-c1ec9fb0c37a`
- Files scanned: 2,464
- Strict PDF (`%PDF-` magic): 1,730
- ALIO: 19
- KODIT: 1,711
- Baseline SHA missing: 0
- Baseline SHA mismatch: 0
- External HTTP used: no
- State changes performed: no
- Measurement ledger SHA-256: `8280c32396aa62656479fbd7f2af0173de2cb87054a2bbd4fbe0efe180f1f7ee`

The count was recomputed from the preserved bytes rather than accepted from a
hard-coded prior total. A `.pdf` extension was not sufficient; DRMONE and
Fasoo containers were excluded because they lack PDF magic.

Prior extraction observations, used only for canary stratification, were:

- `ok`: 1,719
- `pdf_error:PdfReadError`: 10
- `no_text_layer`: 1

No PDF body extraction for the complete 1,730-file population was performed.
