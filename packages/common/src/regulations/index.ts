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
  confidence: number[];
  lifecycle: string;
  verification: string;
  human: "all" | "yes" | "no";
};

export const statusOrder = ["FULLTEXT_PUBLIC", "EXTRACTION_PENDING", "NOTICE_ONLY", "SOURCE_UNKNOWN"];

export function filterRegulations(rows: RegulationRow[], filters: RegulationFilters) {
  const query = filters.query.trim().toLocaleLowerCase("ko-KR");
  return rows.filter((row) =>
    (!query || row.regulation_name.toLocaleLowerCase("ko-KR").includes(query)) &&
    (!filters.statuses.length || filters.statuses.includes(row.public_status_code)) &&
    (!filters.confidence.length || filters.confidence.includes(row.confidence_level)) &&
    (!filters.lifecycle || row.lifecycle_code === filters.lifecycle) &&
    (!filters.verification || row.document_verification_code === filters.verification) &&
    (filters.human === "all" || row.human_confirmed === (filters.human === "yes"))
  );
}

export const downloadColumns: (keyof RegulationRow)[] = [
  "regulation_code", "regulation_name", "normalized_name", "public_status_code", "public_status_label",
  "lifecycle_code", "document_verification_code", "nonpublic_stage", "primary_claim", "confidence_level",
  "decision_reason_code", "decision_reason", "official_source_count", "search_verification_count",
  "human_confirmed", "last_collected_at", "last_verified_at", "official_url", "document_sha256",
  "document_format", "revision_date", "legacy_0811_status", "legacy_0831_status", "methodology_version", "release_status",
];

const csvCell = (value: unknown) => {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export function rowsToCsv(rows: RegulationRow[]) {
  return "\uFEFF" + [downloadColumns.join(","), ...rows.map((row) => downloadColumns.map((key) => csvCell(row[key])).join(","))].join("\r\n") + "\r\n";
}
