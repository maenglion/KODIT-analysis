import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import type {
  OrganizationAttributionExplanationRow,
  DepartmentResidualLabelRow,
  DepartmentResidualOccurrenceRow,
  PublicRegulationSourceRow,
  PublishNoticeRow,
  PublishRegulationRow,
  PublishReleaseMetadata,
  PublicPersonResidualObservationRow,
} from "@kodit/common/regulations";

type PublicSnapshot = {
  snapshot_contract: "public-static-snapshot-v2";
  release: PublishReleaseMetadata;
  rows: PublishRegulationRow[];
  notices: PublishNoticeRow[];
  sources: PublicRegulationSourceRow[];
  residuals: DepartmentResidualOccurrenceRow[];
  residualLabels: DepartmentResidualLabelRow[];
  personResidualObservations: PublicPersonResidualObservationRow[];
  organizationAttributionExplanations: OrganizationAttributionExplanationRow[];
};

let cachedSnapshot: PublicSnapshot | undefined;

async function readSnapshot() {
  if (!cachedSnapshot) {
    const packageRoot = process.cwd().endsWith(path.join("apps", "public-site")) ? process.cwd() : path.join(process.cwd(), "apps", "public-site");
    const compressed = await fs.readFile(path.join(packageRoot, "data", "public-snapshot-v2.json.gz"));
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
  personResidualObservations: PublicPersonResidualObservationRow[];
  organizationAttributionExplanations: OrganizationAttributionExplanationRow[];
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
    personResidualObservations: snapshot.personResidualObservations,
    organizationAttributionExplanations: snapshot.organizationAttributionExplanations,
  };
}

// General posts stay independent of the approved regulation snapshot.
export async function getPublicPosts(): Promise<import("@kodit/common/regulations").PublicPost[]> {
  const root = process.cwd().endsWith(path.join("apps", "public-site")) ? process.cwd() : path.join(process.cwd(), "apps", "public-site");
  try {
    return JSON.parse(await fs.readFile(path.join(root, "data", "public-posts.json"), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function getPublicPostsCoverage(): Promise<import("@kodit/common/regulations").PublicPostsCoverage | undefined> {
  const root = process.cwd().endsWith(path.join("apps", "public-site")) ? process.cwd() : path.join(process.cwd(), "apps", "public-site");
  try { return JSON.parse(await fs.readFile(path.join(root, "data", "public-posts-coverage.json"), "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}
export async function getExternalPublicPosts(): Promise<import("@kodit/common/regulations").PublicPost[]> {
  const root = process.cwd().endsWith(path.join("apps", "public-site")) ? process.cwd() : path.join(process.cwd(), "apps", "public-site");
  try { return JSON.parse(await fs.readFile(path.join(root, "data", "external-public-posts.json"), "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
}
