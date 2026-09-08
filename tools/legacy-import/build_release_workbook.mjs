import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  throw new Error("usage: node build_release_workbook.mjs <workbook-input.json> <output.xlsx>");
}
const data = JSON.parse(await fs.readFile(inputPath, "utf8"));
const workbook = Workbook.create();
const previewsDir = path.join(path.dirname(outputPath), "previews");
await fs.mkdir(previewsDir, { recursive: true });

const COLORS = { navy: "#17365D", blue: "#D9EAF7", green: "#E2F0D9", amber: "#FFF2CC", red: "#FCE4D6", grid: "#D9E2F3", white: "#FFFFFF" };
const excelSafe = (value) => typeof value === "string" && /^[=+\-@]/.test(value) ? `'${value}` : value;
const colName = (n) => {
  let s = "";
  while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); }
  return s;
};

function addDataSheet(name, rows, columns, tableName) {
  const sheet = workbook.worksheets.add(name);
  sheet.showGridLines = false;
  const matrix = [columns, ...rows.map((row) => columns.map((col) => excelSafe(row[col] ?? "")))];
  const lastCol = colName(columns.length);
  const lastRow = Math.max(1, matrix.length);
  sheet.getRange(`A1:${lastCol}${lastRow}`).values = matrix;
  sheet.getRange(`A1:${lastCol}1`).format = {
    fill: COLORS.navy, font: { color: COLORS.white, bold: true }, wrapText: true,
    verticalAlignment: "center", borders: { preset: "all", style: "thin", color: COLORS.grid },
  };
  if (lastRow > 1) {
    sheet.getRange(`A2:${lastCol}${lastRow}`).format = {
      verticalAlignment: "top", wrapText: false, borders: { preset: "all", style: "thin", color: COLORS.grid },
    };
    sheet.tables.add(`A1:${lastCol}${lastRow}`, true, tableName);
  }
  sheet.freezePanes.freezeRows(1);
  sheet.freezePanes.freezeColumns(2);
  sheet.getRange(`A1:${lastCol}1`).format.rowHeight = 34;
  for (let i = 0; i < columns.length; i++) {
    const col = colName(i + 1);
    const key = columns[i];
    const width = /reason|claim|url/.test(key) ? 36 : /name/.test(key) ? 28 : /sha/.test(key) ? 25 : 15;
    sheet.getRange(`${col}:${col}`).format.columnWidth = width;
  }
  return sheet;
}

const rowColumns = [
  "regulation_code", "regulation_name", "public_status_code", "public_status_label", "lifecycle_code",
  "document_verification_code", "nonpublic_stage", "primary_claim", "confidence_level", "decision_reason_code",
  "decision_reason", "official_source_count", "search_verification_count", "human_confirmed", "last_collected_at",
  "last_verified_at", "official_url", "document_sha256", "document_format", "revision_date",
  "legacy_0811_status", "legacy_0831_status", "methodology_version", "release_status",
];
addDataSheet("전체 공개현황", data.rows, rowColumns, "AllRegulations");
addDataSheet("미공개·출처불명", data.exceptions, rowColumns, "ExceptionRegulations");
addDataSheet("주장과 신뢰도", data.claims,
  ["regulation_name", "primary_claim", "confidence_level", "human_confirmed", "reason"], "ClaimConfidence");
addDataSheet("판정기준 해설", data.criteria, ["order", "status", "label", "rule"], "MethodologyCriteria");
addDataSheet("수집·검증 이력", data.crawl_logs,
  ["source", "url", "status", "http_status", "bytes", "bytes_sampled", "inventory_source", "reason", "error"], "CollectionHistory");
addDataSheet("변경내역", data.changes,
  ["regulation_name", "legacy_0811", "legacy_0831", "v04", "reason"], "DecisionChanges");

const overview = workbook.worksheets.getItem("전체 공개현황");
overview.getRange("D2:D2000").conditionalFormats.add("containsText", { text: "전문 공개", format: { fill: COLORS.green } });
overview.getRange("D2:D2000").conditionalFormats.add("containsText", { text: "판정대기", format: { fill: COLORS.amber } });
overview.getRange("D2:D2000").conditionalFormats.add("containsText", { text: "출처불명", format: { fill: COLORS.red } });

workbook.recalculate();
const inspection = await workbook.inspect({ kind: "sheet,table", maxChars: 8000, tableMaxRows: 3, tableMaxCols: 8 });
await fs.writeFile(path.join(path.dirname(outputPath), "workbook-inspection.json"), inspection.ndjson ?? JSON.stringify(inspection), "utf8");
const errors = await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 100 }, maxChars: 6000 });
await fs.writeFile(path.join(path.dirname(outputPath), "workbook-formula-errors.json"), errors.ndjson ?? JSON.stringify(errors), "utf8");
for (const name of ["전체 공개현황", "미공개·출처불명", "주장과 신뢰도", "판정기준 해설", "수집·검증 이력", "변경내역"]) {
  const preview = await workbook.render({ sheetName: name, range: name === "전체 공개현황" ? "A1:L22" : undefined, autoCrop: "all", scale: 0.8, format: "png" });
  await fs.writeFile(path.join(previewsDir, `${name}.png`), new Uint8Array(await preview.arrayBuffer()));
}
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(JSON.stringify({ outputPath, sheets: 6, rows: data.rows.length, statusCounts: data.metadata.status_counts }, null, 2));
