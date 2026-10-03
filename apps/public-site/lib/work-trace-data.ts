import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import type { PublicWorkTraceSnapshot } from "@kodit/common/regulations/work-trace-contract";

let cachedWorkTraceSnapshot: PublicWorkTraceSnapshot | undefined;

export async function getWorkTraceDataset(): Promise<PublicWorkTraceSnapshot> {
  if (!cachedWorkTraceSnapshot) {
    const packageRoot = process.cwd().endsWith(path.join("apps", "public-site"))
      ? process.cwd()
      : path.join(process.cwd(), "apps", "public-site");
    const compressed = await fs.readFile(
      path.join(packageRoot, "data", "public-work-trace-v1.json.gz"),
    );
    cachedWorkTraceSnapshot = JSON.parse(
      gunzipSync(compressed).toString("utf8"),
    ) as PublicWorkTraceSnapshot;
  }
  return cachedWorkTraceSnapshot;
}
