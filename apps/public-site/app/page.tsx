import Link from "next/link";

export default function Home() {
  return (
    <main className="shell home">
      <section className="home-intro">
        <div className="home-copy">
          <p className="eyebrow">KODIT REGULATION ARCHIVE</p>
          <h1>신용보증기금<br /><em>규정, 자료 검증</em></h1>
          <p className="lead">출처, 무결성, 검증 이력 및 판정 이유 제공</p>
          <Link className="primary-link" href="/regulations">전체 규정 공개현황 <span>→</span></Link>
        </div>
        <aside className="home-guide" aria-label="검증 정보 안내">
          <p className="home-guide-label">PUBLIC INFORMATION</p>
          <h2>공식 자료를<br />근거와 함께 확인합니다.</h2>
          <dl>
            <div><dt>공식 출처</dt><dd>발견 경로와 원문 링크</dd></div>
            <div><dt>파일 무결성</dt><dd>SHA-256와 문서 검증</dd></div>
            <div><dt>판정 이력</dt><dd>기준과 신뢰도 공개</dd></div>
          </dl>
        </aside>
      </section>
      <section className="home-shortcuts" aria-label="주요 메뉴">
        <Link href="/regulations"><span>01</span><b>규정·법령</b><small>전체 공개현황 보기</small></Link>
        <Link href="/investment-guarantee"><span>02</span><b>투자·보증</b><small>관련 자료 확인</small></Link>
        <Link href="/methodology"><span>03</span><b>방법론·변경공지</b><small>판정기준 살펴보기</small></Link>
      </section>
    </main>
  );
}
