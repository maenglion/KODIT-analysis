# API permission path review

## Effective path

`api` views are `security_invoker`, but they do not reference raw tables. Each view invokes one
allowlisted `SECURITY DEFINER` function. The caller therefore needs `api` schema usage, view
`SELECT`, and function `EXECUTE`; it does not need `core` schema or table privileges.

| Entry point | Caller checks | Definer function | Raw source and mandatory filter |
|---|---|---|---|
| `public_regulations` | anon/authenticated `SELECT` + function `EXECUTE` | `public_regulation_rows` | `core.regulations`; `visibility = 'public'` |
| `public_facts` | anon/authenticated | `public_fact_rows` | `core.facts` + `core.metrics`; public and verified |
| `public_events` | anon/authenticated | `public_event_rows` | `core.events`; public |
| `public_notices` | anon/authenticated | `public_notice_rows` | `core.notices`; public and published by current time |
| `public_releases` | anon/authenticated | `public_release_rows` | `core.releases`; published and published by current time |
| `public_claims` | anon/authenticated | `public_claim_rows` | `core.claims`; public, confidence gate passed, level 4–5 |
| `office_claims` | authenticated; runtime office/internal check | `office_claim_rows` | `core.claims`; public/office, confidence gate passed, level 4–5 |
| `internal_verification_queue` | authenticated; runtime internal check | `internal_verification_queue_rows` | `core.claims`; internal-only access gate |

## Definer boundary

The ten API functions are explicitly owned by `postgres`. On Supabase that owner can bypass RLS,
including forced RLS, so RLS is not treated as the data filter inside these functions. The safety
boundary is instead all of the following together:

- every function has `SET search_path = ''` and uses schema-qualified objects;
- public functions have no caller-controlled input and contain mandatory publication filters;
- `has_access(text)` rejects values outside `public`, `office`, and `internal`;
- office and internal functions enforce access before reading rows;
- no API function or view references the `case` schema;
- all default `PUBLIC EXECUTE` privileges are revoked after creation;
- only the exact function/view role allowlist is granted;
- no API function mutates `core`, so an authenticated user cannot promote their own access row.

Trigger functions in `core` remain the default `SECURITY INVOKER`. They are not browser-callable
because browser roles have neither `core` schema usage nor function execution grants.

## Function and RPC grants

| Functions | Security mode | Database EXECUTE |
|---|---|---|
| `public_*_rows` | definer | anon, authenticated |
| `current_access_level`, `has_access` | definer | authenticated |
| `office_claim_rows`, `internal_verification_queue_rows` | definer | authenticated; runtime profile gate still mandatory |
| `core` trigger functions | invoker | service_role only as an explicit function grant; invoked by table triggers |
| `test_support.admin_*` | invoker | direct test database owner only; explicitly revoked from browser roles and service_role |

Because PostgREST exposes functions in an exposed schema as RPCs, every `api` row function has the
same role allowance as its corresponding view. Calling the RPC directly does not widen its columns,
filters, or runtime access check.

## PostgREST surface

The four access-contract administration helpers live only in `supabase/tests/fixtures` under the
non-exposed `test_support` schema. They are absent from the operating migration and `api`, and all
browser and `service_role` execution grants are revoked. A direct PostgreSQL test connection is
required to install, invoke, and remove them.
