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
  hwpMissingDependency: "reports/measurements/2026-09-13-hwp-corpus/batch/batch-system-python-missing-dependency.json",
  hwpIncompleteDependency: "reports/measurements/2026-09-13-hwp-corpus/batch/batch-preserved-pydeps-incomplete.json",
};
const readJson = (relative) => readFile(path.join(root, relative), "utf8").then(JSON.parse);
const [hwp, hwpx, pdf, backfill, missingDependency, incompleteDependency, runtime, dependencies] = await Promise.all([
  readJson(sourcePaths.HWP), readJson(sourcePaths.HWPX), readJson(sourcePaths.PDF),
  readJson(sourcePaths.backfill), readJson(sourcePaths.hwpMissingDependency),
  readJson(sourcePaths.hwpIncompleteDependency),
  readJson("workers/collector/parser-runtime-contract.json"),
  readFile(path.join(root, "workers/collector/requirements.txt"), "utf8"),
]);

// Never publish source rows: they contain paths, file names, IDs, hashes and error text.
function requireReproducedPopulation(log, expected, expectedMagic) {
  assert.equal(log.provenance, "ACTUAL_EXECUTION");
  assert.equal(log.population_count, expected);
  assert.equal(log.attempt_count, expected * 2);
  assert.equal(log.results.length, expected);
  assert.equal(log.extract_hash_reproducibility_anomaly_count, 0);
  for (const row of log.results) {
    assert.equal(row.attempts.length, 2);
    assert.equal(row.attempts[0].detected_magic, expectedMagic);
    assert.equal(row.attempts[1].detected_magic, expectedMagic);
    assert.equal(row.attempts[0].result, row.attempts[1].result);
    assert.equal(row.attempts[0].extract_hash, row.attempts[1].extract_hash);
    assert.equal(row.attempts[0].failure_domain, row.attempts[1].failure_domain);
    assert.equal(row.attempts[0].failure_code, row.attempts[1].failure_code);
    assert.equal(row.attempts[0].environment.runtime_contract_status, "SATISFIED");
    assert.equal(row.attempts[1].environment.runtime_contract_status, "SATISFIED");
  }
}
requireReproducedPopulation(hwp, 326, "OLE_HWP");
requireReproducedPopulation(hwpx, 358, "ZIP_HWPX");
requireReproducedPopulation(pdf, 1730, "PDF");
assert.equal(hwp.expected_parser_environment_contract.parser_name, "kodit-hwp-ole");
assert.equal(hwpx.expected_parser_environment_contract.parser_name, "kodit-hwpx-zipxml");
assert.equal(pdf.expected_parser_runtime_contract.parser_name, "kodit-pdf-pypdf");
assert.equal(hwp.expected_parser_environment_contract.parser_version, "0.1.1");
assert.equal(hwpx.expected_parser_environment_contract.parser_version, "0.1.0");
assert.equal(pdf.expected_parser_runtime_contract.parser_version, "0.1.0");
assert.equal(hwp.classification_counts.PARSE_OK_AND_IDENTIFIED + hwp.classification_counts.PARSE_OK_IDENTITY_UNRESOLVED, 326);
assert.equal(hwpx.classification_counts.PARSE_OK_AND_IDENTIFIED + hwpx.classification_counts.PARSE_OK_IDENTITY_UNRESOLVED, 358);
assert.equal(hwp.classification_counts.PARSE_FAILED + hwpx.classification_counts.PARSE_FAILED, 0);
assert.equal(Object.values(pdf.outcome_counts).reduce((a, b) => a + b, 0), 1730);
assert.equal(pdf.outcome_counts.SUCCESS, 1719);
assert.equal(pdf.outcome_counts.NO_EXTRACTABLE_TEXT, 1);
assert.equal(pdf.outcome_counts.ENCRYPTED, 0);
assert.equal(pdf.failure_domain_code_counts["DOCUMENT/PDF_READ_FAILED"], 10);
assert.equal(pdf.nondeterministic_result_count, 0);
assert.equal(pdf.input_sha_or_magic_mismatch_count, 0);
assert.equal(pdf.ocr_performed, false);
assert.equal(pdf.identity_evaluation_performed, false);
assert.equal(pdf.quality_metrics_used_as_thresholds, false);
assert.equal(backfill.ledger.parser_runs, 2414);
assert.equal(backfill.ledger.unique_binaries, 2408);
assert.equal(backfill.ledger.unique_extractions, 2397);
assert.equal(backfill.outcomes.EXTRACTION_FAILED, 10);
assert.equal(backfill.outcomes.NO_EXTRACTABLE_TEXT, 1);
assert.equal(runtime.contract_version, "1.0.0");
assert.equal(runtime.python_version, "3.13.7");
assert.match(dependencies, /^olefile==0\.47$/m);
assert.match(dependencies, /^pypdf==6\.0\.0$/m);

function identityDetails(log, expectedSuffix) {
  const unresolved = log.results.filter((row) => row.classification === "PARSE_OK_IDENTITY_UNRESOLVED");
  const referenceMissing = unresolved.filter((row) => row.identity_reference_found === false).length;
  const textMismatch = unresolved.filter((row) => row.identity_reference_found === true).length;
  const extensionMismatch = log.results.filter((row) => path.extname(row.file_name).toLowerCase() !== expectedSuffix).length;
  assert.equal(referenceMissing + textMismatch, log.classification_counts.PARSE_OK_IDENTITY_UNRESOLVED);
  assert.equal(log.classification_counts.PARSE_OK_AND_IDENTIFIED + unresolved.length, log.population_count);
  return { referenceMissing, textMismatch, extensionMismatch };
}
const hwpDetails = identityDetails(hwp, ".hwp");
const hwpxDetails = identityDetails(hwpx, ".hwpx");
assert.deepEqual(hwpDetails, { referenceMissing: 17, textMismatch: 11, extensionMismatch: 28 });
assert.deepEqual(hwpxDetails, { referenceMissing: 4, textMismatch: 1, extensionMismatch: 2 });
for (const row of pdf.results.filter((item) => item.outcome === "EXTRACTION_FAILED")) {
  assert.equal(row.attempts[0].failure_domain, "DOCUMENT");
  assert.equal(row.attempts[0].failure_code, "PDF_READ_FAILED");
}
for (const [log, signature] of [
  [missingDependency, "RuntimeError:olefile import failed"],
  [incompleteDependency, "RuntimeError:olefile.OleFileIO is unavailable"],
]) {
  assert.equal(log.attempt_count, 652);
  assert.equal(log.automatic_followup_blocked, true);
  assert.equal(log.failure_signature_counts[signature], 652);
}
const measuredEnvironment = hwp.results[0].attempts[0].environment;
for (const log of [hwpx, pdf]) {
  const environment = log.results[0].attempts[0].environment;
  assert.equal(environment.environment_fingerprint, measuredEnvironment.environment_fingerprint);
}
assert.equal(measuredEnvironment.python_version, runtime.python_version);
assert.equal(measuredEnvironment.os, "Windows");
assert.equal(measuredEnvironment.os_release, "11");
assert.equal(measuredEnvironment.architecture, "AMD64");

const publication = {
  contract: "public-parser-measurements-v1",
  measuredAt: "2026-09-17",
  runtime: {
    contract: runtime.contract_version,
    python: `CPython ${runtime.python_version}`,
    olefile: "0.47",
    pypdf: "6.0.0",
    hwpxEngine: "stdlib zipfile + ElementTree",
    measuredPlatform: `${measuredEnvironment.os} ${measuredEnvironment.os_release} / ${measuredEnvironment.architecture}`,
  },
  formats: [
    {
      format: "HWP", parser: "kodit-hwp-ole", version: "0.1.1", engine: "olefile 0.47",
      documents: hwp.population_count, attempts: hwp.attempt_count,
      parsedAndIdentified: hwp.classification_counts.PARSE_OK_AND_IDENTIFIED,
      parsedIdentityUnresolved: hwp.classification_counts.PARSE_OK_IDENTITY_UNRESOLVED,
      parserFailed: hwp.classification_counts.PARSE_FAILED,
      ...hwpDetails, reproducibilityAnomalies: hwp.extract_hash_reproducibility_anomaly_count,
      report: sourcePaths.HWP,
    },
    {
      format: "HWPX", parser: "kodit-hwpx-zipxml", version: "0.1.0", engine: "stdlib zipfile + ElementTree",
      documents: hwpx.population_count, attempts: hwpx.attempt_count,
      parsedAndIdentified: hwpx.classification_counts.PARSE_OK_AND_IDENTIFIED,
      parsedIdentityUnresolved: hwpx.classification_counts.PARSE_OK_IDENTITY_UNRESOLVED,
      parserFailed: hwpx.classification_counts.PARSE_FAILED,
      ...hwpxDetails, reproducibilityAnomalies: hwpx.extract_hash_reproducibility_anomaly_count,
      report: sourcePaths.HWPX,
    },
    {
      format: "PDF", parser: "kodit-pdf-pypdf", version: "0.1.0", engine: "pypdf 6.0.0",
      documents: pdf.population_count, attempts: pdf.attempt_count,
      extracted: pdf.outcome_counts.SUCCESS,
      noText: pdf.outcome_counts.NO_EXTRACTABLE_TEXT,
      encrypted: pdf.outcome_counts.ENCRYPTED,
      readFailed: pdf.failure_domain_code_counts["DOCUMENT/PDF_READ_FAILED"],
      medianPages: pdf.metric_distributions.page_count.median,
      medianCharacters: pdf.metric_distributions.extracted_char_count.median,
      maxReplacementRatio: pdf.metric_distributions.replacement_char_ratio.max,
      reproducibilityAnomalies: pdf.extract_hash_reproducibility_anomaly_count,
      report: sourcePaths.PDF,
    },
  ],
  audit: {
    replayAttempts: hwp.attempt_count + hwpx.attempt_count + pdf.attempt_count,
    extensionMismatches: hwpDetails.extensionMismatch + hwpxDetails.extensionMismatch,
    identityReferenceMissing: hwpDetails.referenceMissing + hwpxDetails.referenceMissing,
    identityTextMismatch: hwpDetails.textMismatch + hwpxDetails.textMismatch,
    priorEnvironmentBlockedBatches: 2,
    reproducibilityAnomalies: hwp.extract_hash_reproducibility_anomaly_count
      + hwpx.extract_hash_reproducibility_anomaly_count + pdf.extract_hash_reproducibility_anomaly_count,
  },
  ledger: {
    parserRuns: backfill.ledger.parser_runs,
    uniqueBinaries: backfill.ledger.unique_binaries,
    nonemptyOccurrences: backfill.outcomes.SUCCESS + backfill.outcomes.IDENTITY_NOT_FOUND,
    uniqueExtractions: backfill.ledger.unique_extractions,
    report: sourcePaths.backfill,
  },
};
assert.equal(publication.audit.replayAttempts, 4828);
assert.equal(publication.ledger.nonemptyOccurrences, 2403);
const output = path.join(root, "apps/public-site/data/public-parser-measurements.json");
const rendered = `${JSON.stringify(publication, null, 2)}\n`;
if (process.argv.includes("--check")) {
  assert.equal(await readFile(output, "utf8"), rendered, "parser public measurements must be regenerated from execution logs");
  console.log(`Parser public measurements PASS (${publication.ledger.parserRuns} ledger runs, ${publication.audit.replayAttempts} replay attempts)`);
} else {
  await writeFile(output, rendered);
  console.log(`Wrote ${output} (${publication.ledger.parserRuns} ledger runs, ${publication.audit.replayAttempts} replay attempts, ${publication.formats.length} formats)`);
}
