import "server-only";
import { Client } from "pg";

export type GateCheck = { description: string; result: string };
export type RegulationDetail = {
  canonical_name: string;
  revision_date: string;
  lifecycle_status: string;
  file_name: string;
  file_size_bytes: string;
  sha256: string;
  page_count: number;
  official_url: string;
  first_seen_at: string;
  last_observed_at: string;
  publication_label: string;
  publication_reason: string;
  confidence_level: number;
  currency_label: string;
  currency_reason: string;
  checks: GateCheck[];
};

const DETAIL_SQL = `
select
  r.canonical_name,
  rv.revision_date::text,
  r.lifecycle_status,
  d.file_name,
  d.file_size_bytes::text,
  d.sha256::text,
  coalesce((cr.log_summary->>'verified_pages')::int, 0) as page_count,
  du.discovered_url as official_url,
  du.first_seen_at::text,
  obs.observed_at::text as last_observed_at,
  pub_status.label as publication_label,
  pub_assignment.reason_text as publication_reason,
  fulltext_claim.confidence_level,
  currency_status.label as currency_label,
  currency_assignment.reason_text as currency_reason,
  coalesce(checks.items, '[]'::jsonb) as checks
from core.regulations r
join core.regulation_versions rv on rv.regulation_id = r.regulation_id
join core.regulation_documents rd on rd.regulation_version_id = rv.regulation_version_id and rd.document_role = 'fulltext'
join core.documents d on d.sha256 = rd.document_sha256
join lateral (
  select x.* from core.document_url_observations x
  where x.document_sha256 = d.sha256 order by x.observed_at desc limit 1
) obs on true
join core.document_urls du on du.document_url_id = obs.document_url_id
left join lateral (
  select run.* from core.crawl_runs run
  join core.source_records sr on sr.source_id = run.source_id
  where sr.source_record_id = du.source_record_id order by run.finished_at desc limit 1
) cr on true
join core.claims fulltext_claim on fulltext_claim.subject_id = rv.regulation_version_id::text
  and fulltext_claim.claim_type = 'fulltext_availability'
join core.status_assignments pub_assignment on pub_assignment.entity_type='document'
  and pub_assignment.entity_id=d.sha256 and pub_assignment.status_code='FULLTEXT_PUBLIC'
join core.status_definitions pub_status on pub_status.methodology_version=pub_assignment.methodology_version
  and pub_status.status_code=pub_assignment.status_code
join core.status_assignments currency_assignment on currency_assignment.entity_type='regulation_version'
  and currency_assignment.entity_id=rv.regulation_version_id::text and currency_assignment.status_code='CURRENT_UNVERIFIED'
join core.status_definitions currency_status on currency_status.methodology_version=currency_assignment.methodology_version
  and currency_status.status_code=currency_assignment.status_code
left join lateral (
  select jsonb_agg(jsonb_build_object('description', c.description, 'result', cc.check_result) order by c.display_order) items
  from core.claim_checks cc join core.criteria c on c.criterion_id=cc.criterion_id
  where cc.claim_id=fulltext_claim.claim_id
) checks on true
where r.canonical_name = '투자옵션부보증 운용기준' and rv.revision_date = date '2024-02-23'
order by obs.observed_at desc limit 1`;

async function queryWithPostgres(connectionString: string): Promise<RegulationDetail | null> {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const result = await client.query<RegulationDetail>(DETAIL_SQL);
    return result.rows[0] ?? null;
  } finally {
    await client.end();
  }
}

async function queryWithManagementApi(projectRef: string, token: string): Promise<RegulationDetail | null> {
  if (!/^[a-z]{20}$/.test(projectRef)) throw new Error("invalid Supabase project ref");
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: DETAIL_SQL }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`database query failed (${response.status})`);
  const rows = (await response.json()) as RegulationDetail[];
  return rows[0] ?? null;
}

export async function getRegulationDetail(): Promise<{ data: RegulationDetail | null; state: "ready" | "missing-env" | "error" }> {
  try {
    if (process.env.KODIT_DATABASE_URL) return { data: await queryWithPostgres(process.env.KODIT_DATABASE_URL), state: "ready" };
    if (process.env.KODIT_SUPABASE_PROJECT_REF && process.env.KODIT_SUPABASE_ACCESS_TOKEN) {
      return { data: await queryWithManagementApi(process.env.KODIT_SUPABASE_PROJECT_REF, process.env.KODIT_SUPABASE_ACCESS_TOKEN), state: "ready" };
    }
    // Local visual QA may inject a row just read from Supabase CLI. It never ships
    // to the client bundle and is actual DB output rather than sample/fallback data.
    if (process.env.KODIT_VERIFIED_ROW_JSON) {
      return { data: JSON.parse(process.env.KODIT_VERIFIED_ROW_JSON) as RegulationDetail, state: "ready" };
    }
    return { data: null, state: "missing-env" };
  } catch (error) {
    console.error("KODIT regulation query failed", error instanceof Error ? error.message : "unknown error");
    return { data: null, state: "error" };
  }
}
