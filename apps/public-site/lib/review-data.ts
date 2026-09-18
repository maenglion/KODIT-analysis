import "server-only";
import type { DepartmentResidualLabelRow, DepartmentResidualOccurrenceRow, PublicRegulationSourceRow, PublishNoticeRow, PublishRegulationRow, PublishReleaseMetadata } from "@kodit/common/regulations";

type RawRegulationSourceRow = PublicRegulationSourceRow & {
  document_sha256?: unknown;
  representation_format?: unknown;
  is_primary?: unknown;
  fulltext_verified?: unknown;
  drm_classification?: unknown;
};

function publicApiConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return url && key ? { url: url.replace(/\/$/, ""), key } : null;
}

function safeWarning(rpc: string, error: unknown) {
  const reason = error instanceof DOMException && error.name === "TimeoutError" ? "timeout" : error instanceof Error ? error.name : "unknown_error";
  console.warn("[publish] public RPC unavailable", { rpc, reason });
}

async function callPublishRpc<T>(name: string, range?: { from: number; to: number }): Promise<T> {
  const config = publicApiConfig();
  if (!config) throw new Error("publish_api_not_configured");
  const query = range ? `?limit=${range.to - range.from + 1}&offset=${range.from}` : "";
  const response = await fetch(`${config.url}/rest/v1/rpc/${name}${query}`, {
    method: "POST",
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
      "Content-Profile": "publish",
      "Accept-Profile": "publish",
    },
    body: "{}",
    cache: "no-store",
    signal: AbortSignal.timeout(7000),
  });
  if (!response.ok) throw new Error(`publish_rpc_http_${response.status}`);
  return await response.json() as T;
}

async function paged<T>(name: string) {
  const pageSize = 1000;
  const result: T[] = [];
  for (let from = 0; from < 100_000; from += pageSize) {
    const page = await callPublishRpc<T[]>(name, { from, to: from + pageSize - 1 });
    result.push(...page);
    if (page.length < pageSize) return result;
  }
  throw new Error(`${name}_pagination_limit`);
}

export async function getPublishDataset(): Promise<
  | { available: true; release: PublishReleaseMetadata; rows: PublishRegulationRow[]; notices: PublishNoticeRow[]; sources: PublicRegulationSourceRow[]; residuals:DepartmentResidualOccurrenceRow[]; residualLabels:DepartmentResidualLabelRow[] }
  | { available: false }
> {
  try {
    const [metadata, rows, notices, rawSources, residuals, residualLabels] = await Promise.all([
      callPublishRpc<PublishReleaseMetadata[]>("public_release_metadata"),
      paged<PublishRegulationRow>("public_regulation_rows"),
      paged<PublishNoticeRow>("public_notice_rows"),
      paged<RawRegulationSourceRow>("public_regulation_source_rows"),
      paged<DepartmentResidualOccurrenceRow>("public_department_residual_analysis_rows"),
      paged<DepartmentResidualLabelRow>("public_department_residual_label_rows"),
    ]);
    const release = metadata[0];
    if (!release || rows.length !== release.population) throw new Error("publish_release_population_mismatch");
    if (rows.some((row) => row.release_id !== release.release_id) || notices.some((row) => row.release_id !== release.release_id)) throw new Error("publish_mixed_release_rows");
    const sources = rawSources.map(({ release_id, regulation_version_id, regulation_code, source_kind, evidence_role, source_location, attachment_name }) => ({ release_id, regulation_version_id, regulation_code, source_kind, evidence_role, source_location, attachment_name }));
    if(residuals.length!==1272||residualLabels.length!==355||residuals.some(row=>row.release_id!==release.release_id)||residualLabels.some(row=>row.release_id!==release.release_id)) throw new Error("publish_residual_population_mismatch");
    return { available: true, release, rows, notices, sources, residuals, residualLabels };
  } catch (error) {
    safeWarning("publish_read_model", error);
    return { available: false };
  }
}
