import type {
  PublicWorkTraceBranch,
  PublicWorkTraceResearchBacklogRow,
} from "@kodit/common/regulations/work-trace-contract";
import { officialSourceUrl, outcomeText } from "./work-trace-view";
import { backlogTargetTitle } from "./work-trace-backlog-view";

export const BACKLOG_NOTE = "현재 영향 분기 수는 해당 자료나 근거를 확인하지 못해 당시 추적이 멈춘 분기 수입니다. 자료를 확보하더라도 모든 분기가 연장되거나 완료된다는 뜻은 아닙니다.";

function cell(value: unknown): string {
  let text = String(value ?? "");
  // A downloaded CSV may be opened in a spreadsheet. Do not execute source text as a formula.
  if (/^[\s]*[=+\-@]/u.test(text)) text = `'${text}`;
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csv(columns: string[], values: unknown[][]): string {
  return "\uFEFF" + [columns, ...values].map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}

export function branchesCsv(rows: PublicWorkTraceBranch[]): string {
  return csv(
    ["사규예고 제목", "게시일", "사규예고 공식 목록 URL", "관련 규정", "규정 공식 URL", "종결값", "완료 범위", "마지막 확인 근거일", "현행 대응 조직 수", "중단 이유"],
    rows.map((row) => [
      row.notice.title,
      row.notice.posted_at,
      officialSourceUrl(row.notice.source_url),
      row.regulation?.title,
      officialSourceUrl(row.regulation?.source_url),
      outcomeText(row),
      row.completion_scope_label,
      row.last_verified_date,
      row.current_endpoint_count,
      row.break?.public_explanation,
    ]),
  );
}

export function endpointsCsv(rows: PublicWorkTraceBranch[], selectedOrganizationKeys?: ReadonlySet<string>): string {
  return csv(
    ["사규예고 제목", "게시일", "관련 규정", "종결값", "현행 조직", "대응 근거 등급", "관측 문구", "현행 업무분장 문구", "근거번호"],
    rows.flatMap((branch) => branch.current_endpoints
      .filter((endpoint) => !selectedOrganizationKeys || selectedOrganizationKeys.has(endpoint.current_org_key))
      .map((endpoint) => [
      branch.notice.title,
      branch.notice.posted_at,
      branch.regulation?.title,
      outcomeText(branch),
      endpoint.current_org_name,
      endpoint.correspondence_basis_label,
      endpoint.observed_phrase,
      endpoint.matched_phrase,
      endpoint.evidence_numbers.join(" · "),
    ])),
  );
}

export function backlogCsv(rows: PublicWorkTraceResearchBacklogRow[], branches: PublicWorkTraceBranch[]): string {
  const byKey = new Map(branches.map((branch) => [branch.public_branch_key, branch]));
  return csv(
    ["조사 구역", "사규예고 제목 또는 규정명", "확인이 필요한 자료·근거", "대상 기간 시작", "대상 기간 끝", "현재 영향 분기 수", "관련 사규예고 수", "관련 규정 수", "마지막 확인 근거번호", "현재 영향 분기 수의 뜻"],
    rows.map((row) => [
      row.need_kind === "RELATION_EVIDENCE_GAP" ? "사규예고→규정 연결 근거 조사" : "규정→현행 업무분장 대응 조사",
      backlogTargetTitle(row, byKey),
      row.required_evidence_description,
      row.period_from,
      row.period_to,
      row.current_affected_branch_count,
      row.affected_notice_count,
      row.affected_regulation_count,
      row.last_evidence_numbers.join(" · "),
      BACKLOG_NOTE,
    ]),
  );
}
