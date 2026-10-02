import Link from "next/link";
import type { Metadata } from "next";
import { getPublishDataset } from "@/lib/review-data";
import { availabilityLabels, availabilityOrder } from "@kodit/common/regulations";

export const metadata: Metadata = {
  title: "KODIT 규정 공개·검증 시스템",
  description: "승인된 공개본에서 규정과 사규예고의 출처·공개 현황·분석 근거를 탐색합니다.",
};

export default async function Home() {
  const { rows, notices, release } = await getPublishDataset();
  const counts = Object.fromEntries(availabilityOrder.map((status) => [status, rows.filter((row) => row.availability === status).length]));
  const latest = [...notices].sort((a, b) => b.posted_date.localeCompare(a.posted_date) || Number(b.notice_number) - Number(a.notice_number)).slice(0, 4);

  return <main className="home-dashboard">
    <section className="home-hero"><div className="shell home-hero-inner"><div className="home-hero-copy"><p className="eyebrow">PUBLIC EVIDENCE ARCHIVE</p><h1>공개된 자료를<br /><em>근거부터 확인합니다.</em></h1><p>신용보증기금의 규정과 사규예고를 공식 출처, 공개 범위, 변경 이력으로 연결합니다. 확인되지 않은 내용은 임의로 확정하지 않습니다.</p><div className="home-hero-actions"><Link className="home-primary-link" href="/regulations">규정 공개현황 살펴보기 <span aria-hidden="true">↗</span></Link><Link className="home-secondary-link" href="/data-purpose">데이터 수집·활용 원칙 <span aria-hidden="true">→</span></Link></div></div><aside className="home-release-card"><span className="home-release-status">● 승인된 정적 공개본</span><h2>현재 공개 범위</h2><dl><div><dt>규정 버전</dt><dd>{rows.length.toLocaleString("ko-KR")}<small>건</small></dd></div><div><dt>사규예고</dt><dd>{notices.length.toLocaleString("ko-KR")}<small>건</small></dd></div></dl><p>근거 기준일 <b>{release.evidence_as_of}</b><br />공개본 생성일 <b>{release.generated_at.slice(0, 10)}</b></p><small>실시간 DB 상태가 아닌 승인 시점의 기록입니다.</small></aside></div></section>
    <div className="shell home-content">
      <section className="home-section"><div className="home-section-heading"><div><p className="eyebrow">EXPLORE</p><h2>어디부터 살펴볼까요?</h2></div><p>자료의 공개 범위와 분석 목적에 맞게 탐색하세요.</p></div><div className="home-entry-grid">
        <Link href="/regulations"><span>01 / 원문·공개 현황</span><h3>규정·법령</h3><p>규정 {rows.length.toLocaleString("ko-KR")}건의 승인된 공개 범위와 공식 출처를 검색합니다.</p><b aria-hidden="true">↗</b></Link>
        <Link href="/department-statistics"><span>02 / 관측·해석</span><h3>부서별 통계</h3><p>조직 표기와 미해결 잔차를 구분하여 확인합니다.</p><b aria-hidden="true">↗</b></Link>
        <Link href="/investment-statistics"><span>03 / 주제별 분석</span><h3>사업별 통계</h3><p>별도 2026.09.19 승인 자료의 투자·보증 주제를 분석합니다.</p><b aria-hidden="true">↗</b></Link>
      </div></section>
      <section className="home-section"><div className="home-section-heading"><div><p className="eyebrow">AVAILABILITY</p><h2>규정 공개현황</h2></div><p>아래 분류는 공개 범위이며, 규정의 현행 여부나 법적 효력을 뜻하지 않습니다.</p></div><div className="home-status-grid">{availabilityOrder.map((status) => <Link key={status} href={`/regulations?category=${status}`}><span>{availabilityLabels[status]}</span><strong>{counts[status].toLocaleString("ko-KR")}<small>건</small></strong><span aria-hidden="true">→</span></Link>)}</div></section>
      <div className="home-bottom-grid"><section className="home-section"><div className="home-section-heading"><div><p className="eyebrow">LATEST NOTICES</p><h2>최근 사규예고</h2></div><Link href="/regulations?scope=notice">전체 보기 →</Link></div><ul className="home-latest-list">{latest.map((notice) => <li key={notice.notice_number}><span>{notice.posted_date}</span><Link href={`/regulations?scope=notice&q=${encodeURIComponent(notice.title)}`}>{notice.title}</Link></li>)}</ul></section><aside className="home-principles"><p className="eyebrow">READ THE CONTEXT</p><h2>숫자보다 근거를<br />먼저 보여줍니다.</h2><p>원본, 추출 본문, 해석 결과를 혼동하지 않도록 각 단계의 출처와 한계를 밝힙니다.</p><Link href="/methodology">검증 방법론 보기 <span aria-hidden="true">→</span></Link></aside></div>
    </div>
  </main>;
}
