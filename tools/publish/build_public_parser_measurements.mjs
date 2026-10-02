import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourcePaths = {
  HWP: "reports/measurements/2026-09-13-runtime-v1-reproduction/hwp/batch-run.json",
  HWPX: "reports/measurements/2026-09-13-runtime-v1-reproduction/hwpx/batch-run.json",
  PDF: "reports/measurements/2026-09-13-pdf-full-corpus/batch-run.json",
  backfill: "reports/measurements/2026-09-17-document-extraction-backfill/summary.json",
};
const readJson = (relative) => readFile(path.join(root, relative), "utf8").then(JSON.parse);
const [hwp, hwpx, pdf, backfill, runtime, dependencies] = await Promise.all([
  readJson(sourcePaths.HWP), readJson(sourcePaths.HWPX), readJson(sourcePaths.PDF), readJson(sourcePaths.backfill),
  readJson("workers/collector/parser-runtime-contract.json"),
  readFile(path.join(root, "workers/collector/requirements.txt"), "utf8"),
]);
const requirePopulation = (log, expected) => {
  assert.equal(log.provenance, "ACTUAL_EXECUTION");
  assert.equal(log.population_count, expected);
  assert.equal(log.attempt_count, expected * 2);
  assert.equal(log.extract_hash_reproducibility_anomaly_count, 0);
};
requirePopulation(hwp, 326);
requirePopulation(hwpx, 358);
requirePopulation(pdf, 1730);
assert.equal(hwp.expected_parser_environment_contract.parser_name, "kodit-hwp-ole");
assert.equal(hwpx.expected_parser_environment_contract.parser_name, "kodit-hwpx-zipxml");
assert.equal(hwp.expected_parser_environment_contract.parser_version, "0.1.1");
assert.equal(hwpx.expected_parser_environment_contract.parser_version, "0.1.0");
assert.equal(hwp.classification_counts.PARSE_OK_AND_IDENTIFIED + hwp.classification_counts.PARSE_OK_IDENTITY_UNRESOLVED, 326);
assert.equal(hwpx.classification_counts.PARSE_OK_AND_IDENTIFIED + hwpx.classification_counts.PARSE_OK_IDENTITY_UNRESOLVED, 358);
assert.equal(hwp.classification_counts.PARSE_FAILED + hwpx.classification_counts.PARSE_FAILED, 0);
assert.equal(Object.values(pdf.outcome_counts).reduce((a, b) => a + b, 0), 1730);
assert.equal(pdf.failure_domain_code_counts["DOCUMENT/PDF_READ_FAILED"], 10);
assert.equal(backfill.ledger.parser_runs, 2414);
assert.equal(backfill.ledger.unique_extractions, 2397);
assert.equal(backfill.outcomes.EXTRACTION_FAILED, 10);
assert.equal(runtime.contract_version, "1.0.0");
assert.equal(runtime.python_version, "3.13.7");
assert.match(dependencies, /^olefile==0\.47$/m);
assert.match(dependencies, /^pypdf==6\.0\.0$/m);

const publication = {
  contract: "public-parser-measurements-v1",
  measuredAt: "2026-09-17",
  runtime: {
    contract: runtime.contract_version,
    python: `CPython ${runtime.python_version}`,
    olefile: "0.47",
    pypdf: "6.0.0",
    hwpxEngine: "stdlib zipfile + ElementTree",
  },
  formats: [
    {
      format: "HWP", parser: "kodit-hwp-ole", version: "0.1.1", engine: "olefile 0.47",
      documents: hwp.population_count, attempts: hwp.attempt_count,
      parsedAndIdentified: hwp.classification_counts.PARSE_OK_AND_IDENTIFIED,
      parsedIdentityUnresolved: hwp.classification_counts.PARSE_OK_IDENTITY_UNRESOLVED,
      parserFailed: hwp.classification_counts.PARSE_FAILED,
      report: sourcePaths.HWP,
    },
    {
      format: "HWPX", parser: "kodit-hwpx-zipxml", version: "0.1.0", engine: "stdlib zipfile + ElementTree",
      documents: hwpx.population_count, attempts: hwpx.attempt_count,
      parsedAndIdentified: hwpx.classification_counts.PARSE_OK_AND_IDENTIFIED,
      parsedIdentityUnresolved: hwpx.classification_counts.PARSE_OK_IDENTITY_UNRESOLVED,
      parserFailed: hwpx.classification_counts.PARSE_FAILED,
      report: sourcePaths.HWPX,
    },
    {
      format: "PDF", parser: "kodit-pdf-pypdf", version: "0.1.0", engine: "pypdf 6.0.0",
      documents: pdf.population_count, attempts: pdf.attempt_count,
      extracted: pdf.outcome_counts.SUCCESS,
      noText: pdf.outcome_counts.NO_EXTRACTABLE_TEXT,
      readFailed: pdf.failure_domain_code_counts["DOCUMENT/PDF_READ_FAILED"],
      report: sourcePaths.PDF,
    },
  ],
  ledger: {
    parserRuns: backfill.ledger.parser_runs,
    uniqueBinaries: backfill.ledger.unique_binaries,
    nonemptyOccurrences: backfill.outcomes.SUCCESS + backfill.outcomes.IDENTITY_NOT_FOUND,
    uniqueExtractions: backfill.ledger.unique_extractions,
    report: sourcePaths.backfill,
  },
};
const output = path.join(root, "apps/public-site/data/public-parser-measurements.json");
await writeFile(output, `${JSON.stringify(publication, null, 2)}\n`);
console.log(`Wrote ${output} (${publication.ledger.parserRuns} parser runs, ${publication.formats.length} formats)`);
