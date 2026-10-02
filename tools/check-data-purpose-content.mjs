import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manuscriptPath = join(root, "apps/public-site/content/data-purpose.md");
const historyPath = join(root, "apps/public-site/data/data-purpose-history.json");
const manuscript = readFileSync(manuscriptPath, "utf8");
const history = JSON.parse(readFileSync(historyPath, "utf8"));
const hash = createHash("sha256").update(manuscript).digest("hex");
const hashPattern = /^[0-9a-f]{64}$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

assert.equal(history.contract, "data-purpose-editorial-history-v1");
assert.match(history.baselineEstablishedOn, datePattern);
assert.match(history.baselineSha256, hashPattern);
assert.ok(Array.isArray(history.revisions));
assert.ok(manuscript.startsWith("**서비스 정보 / 01**\n"));
assert.ok(manuscript.includes("# 데이터 수집·활용 및 개인정보 처리\n"));
assert.ok(manuscript.includes("## 관련 페이지\n"));
assert.ok(manuscript.endsWith("\n"), "원고에는 마지막 줄바꿈이 필요합니다");

for (const revision of history.revisions) {
  assert.match(revision.date, datePattern);
  assert.ok(revision.summary.trim().length > 0);
  assert.match(revision.contentSha256, hashPattern);
}

const previous = history.revisions.at(-1)?.contentSha256 ?? history.baselineSha256;
if (process.argv[2] === "--record") {
  const summary = process.argv.slice(3).join(" ").trim();
  assert.ok(summary.length > 0, '사용법: node tools/check-data-purpose-content.mjs --record "수정 내용 요약"');
  assert.notEqual(hash, previous, "원고가 바뀌지 않았으므로 이력을 추가할 수 없습니다");
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  history.revisions.push({ date, summary, contentSha256: hash });
  writeFileSync(historyPath, `${JSON.stringify(history, null, 2)}\n`);
  console.log(`수정 이력 기록 완료: ${history.revisions.length}건 · ${date} · ${summary}`);
} else {
  assert.ok(process.argv.length === 2 || process.argv[2] === "--check", "알 수 없는 인자입니다");
  assert.equal(hash, previous, '원고가 변경됐습니다. --record "수정 내용 요약" 명령으로 이력을 먼저 기록하세요.');
  console.log(`데이터 수집 목적 원고 검증: 기준본 + 후속 수정 이력 ${history.revisions.length}건`);
}
