import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import type { RegulationRow } from "@kodit/common/regulations";

const dataDir = path.join(process.cwd(), "data", "review-20260908");

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
    human_confirmed: raw.human_confirmed.toLowerCase() === "true",
  } as RegulationRow;
}

export async function getReviewDataset() {
  const [csv, manifestText] = await Promise.all([
    fs.readFile(path.join(dataDir, "regulations.csv"), "utf8"),
    fs.readFile(path.join(dataDir, "manifest.json"), "utf8"),
  ]);
  const matrix = parseCsv(csv); const headers = matrix.shift() ?? [];
  const rows = matrix.map((values) => coerce(Object.fromEntries(headers.map((key, index) => [key, values[index] ?? ""]))));
  const manifest = JSON.parse(manifestText) as { as_of?: string; started_at: string; finished_at: string; release_status: string; result_count: number };
  if (manifest.release_status !== "review_pending" || manifest.result_count !== rows.length) throw new Error("review dataset contract mismatch");
  const completed = new Date(manifest.finished_at); const next = new Date(completed); next.setDate(next.getDate() + 10);
  const date = (value: Date | string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
  return { rows, manifest: { asOf: date(manifest.as_of ?? manifest.started_at), collectedAt: date(completed), verifiedAt: date(completed), nextCheckAt: date(next) } };
}
