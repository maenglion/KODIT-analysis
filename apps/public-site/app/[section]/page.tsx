import { getPublishDataset } from "@/lib/review-data";

const pendingLabels: Record<string, { title: string; reason: string }> = {
  "investment-statistics": { title: "투자·보증 통계", reason: "현재 공개 RPC에는 투자·보증 분류 근거가 포함되어 있지 않아 후속 공개 범위로 남겨둡니다." },
  "technical-specs": { title: "기술 스펙", reason: "등록된 스펙을 공개하는 RPC가 아직 없어 임의 버전이나 수치를 표시하지 않습니다." },
};

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (section === "department-statistics") return <DepartmentStatistics />;
  const content = pendingLabels[section] ?? { title: "페이지", reason: "현재 공개 데이터 계약으로 확인 가능한 내용만 순서대로 제공합니다." };
  return <main className="shell pending"><p className="eyebrow">후속 공개 범위</p><h1>{content.title}</h1><p>{content.reason}</p></main>;
}

async function DepartmentStatistics() {
  const dataset = await getPublishDataset();
  if (!dataset.available) return <main className="shell connection-state"><p className="eyebrow">부서별 통계</p><h1>공개 데이터 연결 확인이 필요합니다</h1><p>측정되지 않은 값을 0건으로 표시하지 않습니다.</p></main>;
  const regulations = new Map(dataset.rows.map((row) => [row.regulation_version_id, row]));
  const departments = new Map<string, { notices: number; linkedNotices: number; linkedRegulations: Set<string>; fulltext: Set<string> }>();
  let linkedNoticeCount = 0;
  for (const notice of dataset.notices) {
    const department = notice.notice_department ?? "담당부서 미기재";
    const value = departments.get(department) ?? { notices: 0, linkedNotices: 0, linkedRegulations: new Set<string>(), fulltext: new Set<string>() };
    value.notices += 1;
    if (notice.linked_regulation_version_ids.length) { value.linkedNotices += 1; linkedNoticeCount += 1; }
    for (const id of notice.linked_regulation_version_ids) {
      value.linkedRegulations.add(id);
      if (regulations.get(id)?.availability === "FULLTEXT_PUBLIC") value.fulltext.add(id);
    }
    departments.set(department, value);
  }
  const rows = [...departments.entries()].map(([department, value]) => ({ department, ...value })).sort((a, b) => b.notices - a.notices || a.department.localeCompare(b.department, "ko"));
  return <main className="shell statistics-page"><p className="eyebrow">부서별 통계</p><h1>사규예고 담당부서 현황</h1><p className="statistics-note">사규예고에 실제 기록된 담당부서만 사용합니다. 규정 연결 통계의 모집단은 연결 식별자가 있는 예고입니다.</p>
    <dl className="statistics-summary"><div><dt>전체 사규예고</dt><dd>{dataset.notices.length.toLocaleString("ko-KR")}건</dd></div><div><dt>규정 연결 예고</dt><dd>{linkedNoticeCount.toLocaleString("ko-KR")}건</dd></div><div><dt>미연결 예고</dt><dd>{(dataset.notices.length - linkedNoticeCount).toLocaleString("ko-KR")}건</dd></div></dl>
    <section className="table-panel"><div className="table-scroll"><table className="regulations-table department-table"><thead><tr><th>사규예고 담당부서</th><th>예고</th><th>규정 연결 예고</th><th>연결 규정</th><th>전문공개 연결 규정</th></tr></thead><tbody>{rows.map((row) => <tr key={row.department}><td>{row.department}</td><td>{row.notices.toLocaleString("ko-KR")}</td><td>{row.linkedNotices.toLocaleString("ko-KR")}</td><td>{row.linkedRegulations.size.toLocaleString("ko-KR")}</td><td>{row.fulltext.size.toLocaleString("ko-KR")}</td></tr>)}</tbody></table></div></section>
  </main>;
}
