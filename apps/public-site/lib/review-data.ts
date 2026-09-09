import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveRegulationDataset, type ApprovedRegulationRow, type ApprovedReleasePayload, type RegulationRow } from "@kodit/common/regulations";

const dataDir = path.join(process.cwd(), "data", "review-20260908");

type CollectionState = {
  last_checked_at: string | null;
  last_successful_at: string | null;
  recent_status: string;
  next_due_at: string | null;
  human_review_pending_count: number;
};

function publicApiConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return url && key ? { url: url.replace(/\/$/, ""), key } : null;
}

function safeRpcWarning(name: string, error: unknown) {
  const reason = error instanceof DOMException && error.name === "TimeoutError" ? "timeout"
    : error instanceof Error ? error.name : "unknown_error";
  console.warn("[regulations] public RPC fallback", { rpc: name, reason });
}

async function callPublicRpc<T>(name: string): Promise<T> {
  const config = publicApiConfig();
  if (!config) throw new Error("public_api_not_configured");
  const response = await fetch(`${config.url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: config.key, "Content-Type": "application/json", "Content-Profile": "api", "Accept-Profile": "api" },
    body: "{}", cache: "no-store", signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`public_rpc_http_${response.status}`);
  return await response.json() as T;
}

async function getCollectionState(): Promise<CollectionState | null> {
  try {
    const states = await callPublicRpc<CollectionState[]>("public_collection_state");
    return states[0] ?? null;
  } catch (error) {
    safeRpcWarning("public_collection_state", error);
    return null;
  }
}

async function getApprovedRelease(): Promise<ApprovedReleasePayload | null> {
  const rawRows = await callPublicRpc<Record<string, unknown>[]>("public_regulation_rows");
  const rows = rawRows
    .filter((row) => typeof row.release_id === "string" && typeof row.release_as_of_date === "string" && row.release_status === "published")
    .map((row) => coerce(row as Record<string, string>) as ApprovedRegulationRow);
  if (!rows.length) return null;
  const releaseId = rows[0].release_id;
  if (rows.some((row) => row.release_id !== releaseId)) throw new Error("mixed_release_rows");
  const releases = await callPublicRpc<Record<string, unknown>[]>("public_release_rows");
  const release = releases.find((item) => item.release_id === releaseId);
  if (!release || typeof release.published_at !== "string") throw new Error("approved_release_metadata_missing");
  const sourceSha = typeof release.source_sha256 === "string" ? release.source_sha256
    : typeof release.file_name === "string" && release.file_name.toLowerCase().endsWith(".csv") && typeof release.file_sha256 === "string" ? release.file_sha256 : null;
  return {
    rows, releaseId, asOf: rows[0].release_as_of_date, approvedAt: release.published_at,
    snapshotRowCount: rows.length, csvSha256: sourceSha,
  };
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((item) => item.some(Boolean));
}

function coerce(raw: Record<string, string>): RegulationRow {
  return {
    ...raw,
    nonpublic_stage: Number(raw.nonpublic_stage || 0), confidence_level: Number(raw.confidence_level || 0),
    official_source_count: Number(raw.official_source_count || 0), search_verification_count: Number(raw.search_verification_count || 0),
    human_confirmed: String(raw.human_confirmed).toLowerCase() === "true",
    legacy_0811_status: raw.legacy_0811_status ?? "", legacy_0831_status: raw.legacy_0831_status ?? "",
  } as RegulationRow;
}

export async function getReviewDataset() {
  const [csv, manifestText, collectionState] = await Promise.all([
    fs.readFile(path.join(dataDir, "regulations.csv"), "utf8"),
    fs.readFile(path.join(dataDir, "manifest.json"), "utf8"),
    getCollectionState(),
  ]);
  const matrix = parseCsv(csv); const headers = matrix.shift() ?? [];
  const fallbackRows = matrix.map((values) => coerce(Object.fromEntries(headers.map((key, index) => [key, values[index] ?? ""]))));
  const manifest = JSON.parse(manifestText) as { as_of?: string; started_at: string; finished_at: string; release_status: string; result_count: number };
  if (manifest.release_status !== "review_pending" || manifest.result_count !== fallbackRows.length) throw new Error("review dataset contract mismatch");
  const selected = await resolveRegulationDataset(getApprovedRelease, fallbackRows, (error) => safeRpcWarning("approved_release", error));
  const rows = selected.rows;
  const completed = new Date(manifest.finished_at); const next = new Date(completed); next.setDate(next.getDate() + 10);
  const date = (value: Date | string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
  const statusLabels: Record<string, string> = { succeeded: "변경사항 수집 완료", no_change: "변경 없음", not_due: "수집 예정일 전 — 정상 생략", failed: "최근 실행 실패", running: "수집 실행 중", waiting: "실행 기록 없음" };
  const recentStatus = collectionState?.recent_status ?? "waiting";
  return {
    rows,
    manifest: {
      asOf: date(selected.asOf ?? manifest.as_of ?? manifest.started_at),
      dataStatus: selected.source === "approved" ? "승인본" : "검토본 · DB 승인 전",
      releaseId: selected.releaseId ?? "승인 전",
      approvedAt: selected.approved ? date(selected.approved.approvedAt) : null,
      snapshotRowCount: selected.approved?.snapshotRowCount ?? null,
      csvSha256Prefix: selected.approved?.csvSha256?.slice(0, 12) ?? (selected.source === "approved" ? "공개 RPC 미제공" : null),
      lastAutomaticCheck: collectionState?.last_checked_at ? date(collectionState.last_checked_at) : "실행 기록 없음",
      lastSuccessfulAt: collectionState?.last_successful_at ? date(collectionState.last_successful_at) : date(completed),
      recentResult: statusLabels[recentStatus] ?? recentStatus,
      nextDueAt: collectionState?.next_due_at ? date(collectionState.next_due_at) : date(next),
      automationStatus: recentStatus === "failed" ? "실패" : recentStatus === "waiting" ? "실행대기" : "작동 중",
      humanReviewPendingCount: collectionState?.human_review_pending_count ?? rows.filter((row) => !row.human_confirmed).length,
    },
  };
}
