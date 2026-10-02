import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const specs = JSON.parse(await readFile("apps/public-site/data/technical-specs.json", "utf8"));
const page = await readFile("apps/public-site/components/InformationPages.tsx", "utf8");
const evidence = await readFile("apps/public-site/components/ParserEvidence.tsx", "utf8");

assert.equal(specs.length, 9);
assert.match(page, /technicalSpecs\.map/);
assert.match(page, /<ParserEvidence\s*\/>/);
assert.match(evidence, /runtime\.measuredPlatform/);
assert.match(evidence, /format\.referenceMissing/);
assert.match(evidence, /format\.textMismatch/);
assert.match(evidence, /format\.readFailed/);
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

const approvedOriginalFonts = {
  "KoPubWorld-Dotum-Medium.ttf": "6269624bd0c5ae8746a8e731b8087f056088af930a7bbc0efb76902bf732a293",
  "KoPubWorld-Dotum-Bold.ttf": "896a4952ab3c28108c095c638548989a82295cf644bcced1d4c53f5616a90db6",
};
for (const [file, originalSha256] of Object.entries(approvedOriginalFonts)) {
  const bytes = await readFile(`apps/public-site/public/fonts/${file}`);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), originalSha256, `KoPub official TTF changed: ${file}`);
}

execFileSync(process.execPath, ["tools/publish/build_public_parser_measurements.mjs", "--check"], { stdio: "pipe" });
console.log(`technical specs: ${specs.length} components, ${specs.reduce((count, spec) => count + spec.artifacts.length, 0)} canonical artifact hashes, 2 original font files, replay log projection PASS`);
