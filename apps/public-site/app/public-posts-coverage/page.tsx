import Link from "next/link";
import { getPublicPostsCoverage } from "@/lib/review-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "게시판수집현황 | KODIT" };

export default async function PublicPostsCoveragePage() {
  const coverage = await getPublicPostsCoverage();
  return <>
    <section className="public-page-intro"><div className="shell intro-inner"><div className="intro-copy">
      <p className="breadcrumb"><Link href="/regulations?scope=posts">신용보증기금 전체게시물</Link> &gt; 게시판수집현황</p>
      <h1>게시판수집현황</h1>
      <p>홈페이지 메뉴에서 확인한 공개 게시판의 수집 범위와 확보 상태입니다.</p>
    </div></div></section>
    <main className="shell information-page">
      {!coverage ? <p>수집 현황 자료를 확인할 수 없습니다.</p> : <>
        <p>{coverage.coverage_note}</p>
        <p>게시판 {coverage.boards.length}개 · 게시물 {coverage.posts_count.toLocaleString("ko-KR")}건 · 수집 실패 기록 {coverage.failures.length}건</p>
        <p>본문 확보 {coverage.body_count.toLocaleString("ko-KR")}건. 본문 미확보 항목은 제목·확보된 첨부파일명으로 검색합니다. 기존 사규 매핑 분석에는 사용하지 않았습니다.</p>
        <div className="table-scroll"><table className="regulations-table"><thead><tr><th>게시판</th><th>공개 목록 건수</th><th>수집 건수</th><th>상태</th></tr></thead><tbody>
          {coverage.boards.map(board => <tr key={board.board_id}><td>{board.name} ({board.board_id})</td><td>{board.listed_total ?? "미확인"}</td><td>{board.collected_count}</td><td>{board.excluded_reason ?? (board.listing_complete ? "목록 수집 완료 · 상세 별도" : "수집 미완료")}</td></tr>)}
        </tbody></table></div>
      </>}
    </main>
  </>;
}
