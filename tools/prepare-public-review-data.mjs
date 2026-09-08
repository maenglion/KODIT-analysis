import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const source = path.join(root, "outputs", "01a070bf-ca26-7fd1-a890-58c75d304f27");
const target = path.join(root, "apps", "public-site", "data", "review-20260908");
await fs.mkdir(target, { recursive: true });
await fs.copyFile(path.join(source, "kodit_regulation_status_latest_20260908.csv"), path.join(target, "regulations.csv"));
await fs.copyFile(path.join(source, "kodit_regulation_unpublished_unknown_20260908.csv"), path.join(target, "unpublished-unknown.csv"));
const manifest = JSON.parse(await fs.readFile(path.join(source, "kodit_regeneration_manifest_20260908.json"), "utf8"));
delete manifest.outputs;
delete manifest.source_runs;
manifest.data_source = "server-bundled review-20260908";
manifest.release_status = "review_pending";
await fs.writeFile(path.join(target, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log(JSON.stringify({ target, rows: manifest.result_count, status: manifest.release_status }));
