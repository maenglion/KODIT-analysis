import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const specs = JSON.parse(await readFile("apps/public-site/data/technical-specs.json", "utf8"));
const page = await readFile("apps/public-site/app/[section]/page.tsx", "utf8");

assert.equal(specs.length, 9);
assert.match(page, /technicalSpecs\.map/);
assert.doesNotMatch(page, /callPublishRpc|public_technical|service_role/i);
for (const spec of specs) {
  assert.ok(spec.name && spec.role && spec.version && spec.updatedAt);
  assert.ok(["active", "deprecated"].includes(spec.status));
  assert.ok(spec.artifacts.length > 0);
  for (const artifact of spec.artifacts) {
    const bytes = await readFile(artifact.path);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), artifact.sha256, `artifact hash mismatch: ${artifact.path}`);
  }
}

console.log(`technical specs: ${specs.length} components, ${specs.reduce((count, spec) => count + spec.artifacts.length, 0)} canonical artifact hashes PASS`);
