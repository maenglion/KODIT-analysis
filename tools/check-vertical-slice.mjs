import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
  cwd: root,
  encoding: "utf8",
}).split("\0").filter(Boolean);

const forbiddenExtensions = /\.(pdf|hwp|hwpx|docx?|xlsx?|csv|tsv|zip|7z|rar|sqlite3?|db|dump)$/i;
const secretPatterns = [
  /github_pat_[A-Za-z0-9_]{20,}/,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/,
  /\bsb_(?:publishable|secret)_[A-Za-z0-9_-]{16,}\b/,
  /\b(?:postgres|postgresql):\/\/[^\s:@]+:[^\s@]+@[^\s/]+\//,
];
const privateDataPatterns = [
  /\b\d{6}-[1-4]\d{6}\b/,
  /\b\d{4}(?:가단|고단|형제|합|나|도)[가-힣]*\d{3,}\b/,
];

let scanned = 0;
for (const relative of files) {
  assert.doesNotMatch(relative, forbiddenExtensions, `binary/private source artifact must not be tracked: ${relative}`);
  const absolute = path.join(root, relative);
  if (!fs.statSync(absolute).isFile() || fs.statSync(absolute).size > 2_000_000) continue;
  const content = fs.readFileSync(absolute, "utf8");
  const withoutExamples = content.split(/\r?\n/).filter((line) => !/example|replace/i.test(line)).join("\n");
  for (const pattern of secretPatterns) assert.doesNotMatch(withoutExamples, pattern, `credential-like value: ${relative}`);
  for (const pattern of privateDataPatterns) assert.doesNotMatch(content, pattern, `case/private identifier: ${relative}`);
  assert.doesNotMatch(content, /NEXT_PUBLIC_[A-Z0-9_]*(?:DATABASE|SERVICE_ROLE|ACCESS_TOKEN)/, `server credential exposed to browser: ${relative}`);
  scanned += 1;
}

const page = fs.readFileSync(path.join(root, "apps/public-site/app/regulations/investment-option-guarantee/page.tsx"), "utf8");
for (const required of ["전문 공개", "현행 여부", "confidence_level", "official_url", "sha256", "file_size_bytes", "page_count"]) {
  assert.ok(page.includes(required), `public detail page is missing ${required}`);
}
console.log(JSON.stringify({ passed: true, scannedFiles: scanned, trackedPrivateArtifacts: 0, credentialFindings: 0, caseIdentifierFindings: 0 }));
