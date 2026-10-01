import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import type {
  DepartmentAttributionExplanationRow,
  DepartmentResidualLabelRow,
  DepartmentResidualOccurrenceRow,
  PublicRegulationSourceRow,
  PublishNoticeRow,
  PublishRegulationRow,
  PublishReleaseMetadata,
} from "@kodit/common/regulations";

type PublicSnapshot = {
  snapshot_contract: "public-static-snapshot-v1";
  release: PublishReleaseMetadata;
  rows: PublishRegulationRow[];
  notices: PublishNoticeRow[];
  sources: PublicRegulationSourceRow[];
  residuals: DepartmentResidualOccurrenceRow[];
  residualLabels: DepartmentResidualLabelRow[];
  attributionExplanations: DepartmentAttributionExplanationRow[];
};

let cachedSnapshot: PublicSnapshot | undefined;

async function readSnapshot() {
  if (!cachedSnapshot) {
    const packageRoot = process.cwd().endsWith(path.join("apps", "public-site")) ? process.cwd() : path.join(process.cwd(), "apps", "public-site");
    const compressed = await fs.readFile(path.join(packageRoot, "data", "public-snapshot-v1.json.gz"));
    cachedSnapshot = JSON.parse(gunzipSync(compressed).toString("utf8")) as PublicSnapshot;
  }
  return cachedSnapshot;
}

export async function getPublishDataset(): Promise<{
  available: true;
  release: PublishReleaseMetadata;
  rows: PublishRegulationRow[];
  notices: PublishNoticeRow[];
  sources: PublicRegulationSourceRow[];
  residuals: DepartmentResidualOccurrenceRow[];
  residualLabels: DepartmentResidualLabelRow[];
  attributionExplanations: DepartmentAttributionExplanationRow[];
}> {
  const snapshot = await readSnapshot();
  return {
    available: true,
    release: snapshot.release,
    rows: snapshot.rows,
    notices: snapshot.notices,
    sources: snapshot.sources,
    residuals: snapshot.residuals,
    residualLabels: snapshot.residualLabels,
    attributionExplanations: snapshot.attributionExplanations,
  };
}
