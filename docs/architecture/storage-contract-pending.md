# Storage contract pending approval

The SQL in `supabase/drafts/20260905_storage_policy_draft.sql` is not a migration and must not be
executed until every pending item below is approved.

## Planned buckets

| Bucket | Purpose | Access mode |
|---|---|---|
| `core-documents` | Collected regulations, official source documents, and extraction inputs | Private |
| `case-documents` | Case files, party-related documents, guarantee references, and case disclosure material | Private; no browser policy |
| `release-artifacts` | Approved public and office release files | Private; delivery requires an approved access path or signed URL |

## Draft policies

| Policy | Bucket | Role | Action |
|---|---|---|---|
| `kodit_internal_core_objects_select` | `core-documents`, `release-artifacts` | authenticated with internal access | SELECT |
| `kodit_office_release_artifacts_select` | `release-artifacts` | authenticated with office or internal access | SELECT |
| `kodit_internal_core_objects_insert` | `core-documents`, `release-artifacts` | authenticated with internal access | INSERT |
| `kodit_internal_core_objects_update` | `core-documents`, `release-artifacts` | authenticated with internal access | UPDATE |
| `kodit_internal_core_objects_delete` | `core-documents`, `release-artifacts` | authenticated with internal access | DELETE |

No browser policy is planned for `case-documents` in the current draft.

## Decisions still required

- MIME type allowlist for every bucket
- File-size limit for every bucket
- Signed URL lifetime and renewal rules
- Physical separation boundary between general source documents and case documents
- Roles and server identities allowed to upload
- Deletion, replacement, version history, retention, and legal-hold rules

**Execution hold:** the Storage draft must remain unexecuted until all items above are approved and
the draft is reviewed as a separate migration candidate.
