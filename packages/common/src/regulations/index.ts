export type RegulationRow = {
  regulation_code: string;
  regulation_name: string;
  normalized_name: string;
  public_status_code: string;
  public_status_label: string;
  lifecycle_code: string;
  document_verification_code: string;
  nonpublic_stage: number;
  primary_claim: string;
  confidence_level: number;
  decision_reason_code: string;
  decision_reason: string;
  official_source_count: number;
  search_verification_count: number;
  human_confirmed: boolean;
  last_collected_at: string;
  last_verified_at: string;
  official_url: string;
  document_sha256: string;
  document_format: string;
  revision_date: string;
  legacy_0811_status: string;
  legacy_0831_status: string;
  methodology_version: string;
  release_status: string;
};

export type RegulationFilters = {
  query: string;
  statuses: string[];
  lifecycle: string;
  verification: string;
};

export type ApprovedRegulationRow = RegulationRow & {
  release_id: string;
  release_as_of_date: string;
};

export type ApprovedReleasePayload = {
  rows: ApprovedRegulationRow[];
  releaseId: string;
  asOf: string;
  approvedAt: string;
  snapshotRowCount: number;
  csvSha256: string | null;
};

export function chooseRegulationDataset(approvedRows: ApprovedRegulationRow[], fallbackRows: RegulationRow[]) {
  if (approvedRows.length > 0) {
    const first = approvedRows[0];
    if (!first.release_id || !first.release_as_of_date || approvedRows.some((row) => row.release_id !== first.release_id)) {
      throw new Error("approved release dataset contract mismatch");
    }
    return { rows: approvedRows as RegulationRow[], source: "approved" as const, releaseId: first.release_id, asOf: first.release_as_of_date };
  }
  return { rows: fallbackRows, source: "fallback" as const, releaseId: null, asOf: null };
}

export async function resolveRegulationDataset(
  loadApproved: () => Promise<ApprovedReleasePayload | null>,
  fallbackRows: RegulationRow[],
  onFailure?: (error: unknown) => void,
) {
  try {
    const approved = await loadApproved();
    if (approved?.rows.length) {
      const selected = chooseRegulationDataset(approved.rows, fallbackRows);
      if (approved.releaseId !== selected.releaseId || approved.snapshotRowCount !== approved.rows.length) {
        throw new Error("approved release metadata contract mismatch");
      }
      return { ...selected, approved, rpcFailed: false };
    }
    return { ...chooseRegulationDataset([], fallbackRows), approved: null, rpcFailed: false };
  } catch (error) {
    onFailure?.(error);
    return { ...chooseRegulationDataset([], fallbackRows), approved: null, rpcFailed: true };
  }
}

export const statusOrder = ["FULLTEXT_PUBLIC", "EXTRACTION_PENDING", "NOTICE_ONLY", "SOURCE_UNKNOWN"];

export function isLegacyRegulationRow(row: RegulationRow) {
  return row.methodology_version === "v0.4" || row.methodology_version === "legacy_methodology";
}

export function publicAvailabilityLabel(row: RegulationRow) {
  if (!isLegacyRegulationRow(row)) return row.public_status_label;
  if (row.public_status_code === "EXTRACTION_PENDING") return "미확정";
  return `이전 판정 · ${row.public_status_label}`;
}

export function processingStatusLabel(row: RegulationRow) {
  return isLegacyRegulationRow(row) ? "v0.5 재평가 대기" : "평가 완료";
}

export function filterRegulations(rows: RegulationRow[], filters: RegulationFilters) {
  const query = filters.query.trim().toLocaleLowerCase("ko-KR");
  return rows.filter((row) =>
    (!query || row.regulation_name.toLocaleLowerCase("ko-KR").includes(query)) &&
    (!filters.statuses.length || filters.statuses.includes(row.public_status_code)) &&
    (!filters.lifecycle || row.lifecycle_code === filters.lifecycle) &&
    (!filters.verification || row.document_verification_code === filters.verification)
  );
}

export function validOfficialUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

const publicDownloadColumns: [string, (row: RegulationRow) => unknown][] = [
  ["regulation_code", (row) => row.regulation_code],
  ["regulation_name", (row) => row.regulation_name],
  ["normalized_name", (row) => row.normalized_name],
  ["previous_public_status_code", (row) => row.public_status_code],
  ["previous_public_status_label", (row) => row.public_status_label],
  ["current_processing_status", processingStatusLabel],
  ["lifecycle_code", (row) => row.lifecycle_code],
  ["previous_document_verification_code", (row) => row.document_verification_code],
  ["previous_nonpublic_stage", (row) => row.nonpublic_stage],
  ["primary_claim", (row) => row.primary_claim],
  ["previous_decision_reason_code", (row) => row.decision_reason_code],
  ["previous_decision_reason", (row) => row.decision_reason],
  ["official_source_count", (row) => row.official_source_count],
  ["search_verification_count", (row) => row.search_verification_count],
  ["last_collected_at", (row) => row.last_collected_at],
  ["last_verified_at", (row) => row.last_verified_at],
  ["official_url", (row) => row.official_url],
  ["document_sha256", (row) => row.document_sha256],
  ["document_format", (row) => row.document_format],
  ["revision_date", (row) => row.revision_date],
  ["legacy_0811_status", (row) => row.legacy_0811_status],
  ["legacy_0831_status", (row) => row.legacy_0831_status],
  ["methodology_version", (row) => row.methodology_version],
  ["release_status", (row) => row.release_status],
];

const csvCell = (value: unknown) => {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export function rowsToCsv(rows: RegulationRow[]) {
  return "\uFEFF" + [
    publicDownloadColumns.map(([label]) => label).join(","),
    ...rows.map((row) => publicDownloadColumns.map(([, value]) => csvCell(value(row))).join(",")),
  ].join("\r\n") + "\r\n";
}
