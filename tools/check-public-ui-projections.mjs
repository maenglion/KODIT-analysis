import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import {
  topicNoticePublications, topicNoticeKey, topicPublicationDescription, topicEvidenceNoticesToCsv,
} from '../apps/public-site/lib/topic-publication-view.ts';
import {
  backlogTargetTitle, visibleBacklogSection,
} from '../apps/public-site/lib/work-trace-backlog-view.ts';

const base = new URL('../apps/public-site/data/', import.meta.url);
const readJson = (file) => JSON.parse(readFileSync(new URL(file, base), 'utf8'));
const readGzip = (file) => JSON.parse(gunzipSync(readFileSync(new URL(file, base))));
const topic = readJson('topic-public-v2.json');
const approved = readGzip('public-snapshot-v2.json.gz');
const trace = readGzip('public-work-trace-v1.json.gz');

const statuses = topicNoticePublications(topic.notices, approved.notices, approved.rows);
assert.equal(topic.notices.length, 62);
assert.equal(Object.keys(statuses).length, 62);
assert.ok(Object.values(statuses).every((status) => status.matchedNotice));
assert.equal(Object.values(statuses).filter((status) => status.linkedVersionCount === 0).length, 7);
assert.ok(Object.values(statuses).every((status) =>
  Object.values(status.statusCounts).reduce((sum, count) => sum + count, 0) === status.knownVersionCount));
assert.ok(Object.values(statuses).every((status) => status.knownVersionCount === status.linkedVersionCount));
assert.equal(topicPublicationDescription(statuses[topicNoticeKey(topic.notices.find((notice) => !statuses[topicNoticeKey(notice)].linkedVersionCount))]), '연결 규정 미확인');
const subset = topic.notices.filter((notice) => notice.families.includes('INVESTMENT_OPTION_GUARANTEE'));
assert.equal(subset.length, 12);
assert.equal(subset.filter((notice) => statuses[topicNoticeKey(notice)].statusCounts.NOTICE_ONLY > 0).length, 12);
const csv = topicEvidenceNoticesToCsv(subset, new Map(topic.families.map(({ code, name }) => [code, name])), statuses, approved.release.evidence_as_of);
assert.ok(csv.startsWith('\uFEFF'));
assert.equal(csv.trim().split('\r\n').length, 13);
assert.ok(csv.includes(`연결 규정 버전 공개 범위 (${approved.release.evidence_as_of})`));
assert.ok(!csv.includes('public_alias') && !csv.includes('current_org_candidate'));

const branches = new Map(trace.branches.map((branch) => [branch.public_branch_key, branch]));
assert.equal(trace.research_backlog.length, 677);
assert.ok(trace.research_backlog.every((item) => backlogTargetTitle(item, branches) !== '대상 제목 대조 미확인'));
const relation = visibleBacklogSection(trace.research_backlog, 'RELATION_EVIDENCE_GAP', 1, 10, branches);
const functionGroup = visibleBacklogSection(trace.research_backlog, 'FUNCTION_CORRESPONDENCE_UNCONFIRMED', 1, 10, branches);
assert.deepEqual([relation.count, functionGroup.count], [362, 315]);
assert.equal(relation.rows.length, 10);
assert.equal(functionGroup.rows.length, 10);
assert.ok([...relation.rows, ...functionGroup.rows].every((row) => row.targetTitle && !('public_branch_keys' in row)));
assert.equal(trace.summary.terminal_outcomes.RELATION_EVIDENCE_GAP, 362);
assert.equal(trace.summary.terminal_outcomes.FUNCTION_CORRESPONDENCE_UNCONFIRMED, 650);
assert.equal(trace.summary.terminal_outcomes.RELATION_EVIDENCE_GAP + trace.summary.terminal_outcomes.FUNCTION_CORRESPONDENCE_UNCONFIRMED, 1012);
console.log('public UI projection: 62 matched notices, 12 selected family notices, 677 needs (362+315) and 1012 affected branches PASS');
