# KODIT v0.6 baseline projection

`project_v06_baseline.mjs` is the only implementation of the v0.6 baseline projection. It does not scrape, download, parse, or edit source artifacts.

The baseline projection is implemented as a versioned `.mjs` module for the repository's Node ESM environment and reproducible execution on Windows.

## Fixed identity

- UUIDv5 namespace: `71e07e7a-8e4e-569c-86cf-38cde51739a7`
- canonical release name: `kodit:v0.6:baseline:2026-09-14`
- baseline release UUID: `9a87d0c2-2901-5fc8-bceb-f068f02b697a`
- canonical cycle name: `kodit:v0.6:baseline-cycle:2026-09-14`
- baseline collection-cycle UUID: `3773771c-af63-570a-ad4d-1fae255da383`
- expected population: 1,041

The generated release is a baseline, so every row starts with `is_new=false` and `is_updated=false`.

## Inputs

Repository inputs are fixed in the script:

- reconstructed 1,041-row regulation CSV and manifest;
- runtime-v1 HWP and HWPX measurements;
- full-corpus PDF measurements;
- OTHER/DRM classification measurements.

The caller supplies `--evidence-root`; paths below that root are also fixed:

- `06_게시물별_규정명_언급행_전체.csv`;
- `07_첨부_SHA256_매니페스트.csv`;
- `kodit_preannouncements.json`;
- `alio_internal_rules.json`.

No user-specific absolute path is stored in the manifest or database.

`source_snapshot_hash` covers the complete `input_artifacts` array (`name`, logical `path`, and each file's SHA-256), ordered canonically by artifact name. The array is serialized as UTF-8 with recursively sorted object keys and stable array order, then hashed once with SHA-256.

## Deterministic joins

1. `normalized_name -> normalized_rule_name -> post_number -> preannouncement.number` supplies an evidenced notice department.
2. `official_url -> extraction_manifest.download_url` supplies filename, SHA-256, and source kind.
3. `document SHA-256 -> parser measurement baseline SHA-256` supplies the observed representation format.
4. `document SHA-256 -> OTHER measurement baseline SHA-256` supplies DRM classification.

The source contains eight duplicated regulation-code/name groups and nine excess rows. They are not merged. A deterministic `regulation_version_id` derived from the complete preserved source row keeps all 1,041 rows while a shared `regulation_id` preserves their canonical-code relationship.

Rows without a deterministic source URL remain in the population with `source_location=NULL`. Missing source location is not converted to `SOURCE_UNKNOWN`.

## Execution

Build-only measurement:

```powershell
node tools/publish/project_v06_baseline.mjs --evidence-root '<preserved-evidence-root>'
```

Apply after the migration is installed:

```powershell
node tools/publish/project_v06_baseline.mjs --evidence-root '<preserved-evidence-root>' --apply
```

Candidate setup and deterministic 200-row inserts are resumable and idempotent. Every existing row is compared with the newly projected value; an unequal value fails instead of being overwritten. After all candidate rows exist, candidate verification, the `approved` status transition, and the singleton current-pointer update run together in one advisory-lock transaction. A second identical run reports reproduction success without changing the snapshot.

## Public access choice

This migration uses option A: public-safe RPC only.

- `anon` and `authenticated` receive no base-table privileges.
- They can execute only the four explicit `publish.public_*` read functions.
- Each function has `SECURITY DEFINER`, an empty fixed `search_path`, and an explicit `current_release + approved` predicate.
- `core`, `case`, and legacy `api` are not altered.
- The `publish` schema is not added to the PostgREST exposed-schema configuration in this step; UI cutover remains a later decision.

## Measured baseline exceptions

The versioned artifacts currently reproduce 1,041 rows, but two earlier lineage estimates do not reproduce literally:

- exact notice chain: 982/1,041, not 981/1,041;
- exact URL-to-SHA manifest linkage: 1,015/1,041, not 1,035/1,041.

The official source URL itself is present for 1,035/1,041 rows. These differences are retained as measured coverage and are not repaired by inference.

## Baseline correction

`project_v06_baseline_correction.mjs` preserves the original baseline release and projects an approved correction release from the preserved 2,089-row notice artifact plus the two direct identity-resolution records. The correction uses the same collection-cycle UUID as the baseline, keeps every regulation row at `is_new=false` and `is_updated=false`, and moves the singleton current pointer only after all correction assertions pass.

- canonical correction name: `kodit:v0.6:baseline-correction:2026-09-14`
- correction release UUID: `47c5562f-b3be-5105-8e4f-dca2f56574f6`
- preserved notice evidence date: `2026-08-31`
- corrected notice range: 2,073 through 2,089, posted from `2026-08-04` through `2026-08-31`
