import { getRegulationDetail } from "@/lib/regulation";

export const dynamic = "force-dynamic";

const formatDate = (value: string) => new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeZone: "Asia/Seoul" }).format(new Date(value));
const formatBytes = (value: string) => `${Number(value).toLocaleString("ko-KR")}바이트`;

export default async function RegulationPage() {
  const { data, state } = await getRegulationDetail();
  if (!data) {
    return (
      <main className="shell connection-state">
        <p className="eyebrow">데이터 연결 필요</p>
        <h1>규정 정보를 불러올 수 없습니다.</h1>
        <p>{state === "missing-env" ? "서버 전용 Supabase 연결 환경변수를 설정해 주세요." : "서버의 데이터 연결 상태를 확인해 주세요."}</p>
        <code>KODIT_DATABASE_URL</code>
      </main>
    );
  }

  return (
    <main className="regulation-page">
      <section className="hero shell">
        <p className="breadcrumb">규정·법령 / 투자·보증</p>
        <div className="hero-grid">
          <div>
            <p className="eyebrow">신용보증기금 공식 원문</p>
            <h1>{data.canonical_name}</h1>
            <p className="revision">{data.revision_date.replaceAll("-", ".")} 개정본</p>
          </div>
          <a className="source-link" href={data.official_url} target="_blank" rel="noreferrer">공식 원문 열기 <span>↗</span></a>
        </div>
        <div className="status-row">
          <details className="status-card public">
            <summary><span>공개상태</span><strong>{data.publication_label}</strong><small>판정기준 보기</small></summary>
            <div><p>{data.publication_reason}</p><p>공식 출처의 PDF 본문에서 규정명·개정일·조문을 확인했습니다.</p></div>
          </details>
          <details className="status-card confidence">
            <summary><span>주 주장 신뢰도</span><strong>{data.confidence_level} 확정</strong><small>충족 게이트 보기</small></summary>
            <div><ul>{data.checks.map((check) => <li key={check.description}><b aria-label="통과">✓</b>{check.description}</li>)}</ul></div>
          </details>
          <div className="status-card current"><span>현행 여부</span><strong>{data.currency_label}</strong><small>후속 개정 확인 중</small></div>
        </div>
      </section>

      <section className="content shell">
        <article className="facts-panel">
          <div className="section-heading"><p className="eyebrow">원문 무결성</p><h2>확인된 파일 정보</h2></div>
          <dl>
            <div><dt>파일명</dt><dd>{data.file_name}</dd></div>
            <div><dt>개정일</dt><dd>2024.02.23.</dd></div>
            <div><dt>분량</dt><dd>{data.page_count}쪽</dd></div>
            <div><dt>파일 크기</dt><dd>{formatBytes(data.file_size_bytes)}</dd></div>
            <div className="hash"><dt>SHA-256</dt><dd>{data.sha256}</dd></div>
            <div><dt>최초 발견경로</dt><dd>신용보증기금 공식 다운로드</dd></div>
            <div><dt>최종 확인일</dt><dd>{formatDate(data.last_observed_at)}</dd></div>
          </dl>
        </article>

        <aside className="interpretation">
          <p className="eyebrow">읽는 법</p>
          <h2>전문 공개와 현행 여부는<br />서로 다른 주장입니다.</h2>
          <p>이 파일이 2024.02.23. 개정 규정의 전문이라는 점은 확인했습니다. 다만 2026.06.24. 개정 사전예고 이후 실제 시행본·최종본이 별도로 존재하는지는 아직 확인 중입니다.</p>
          <div className="claim-flow"><span>원문 확인 <b>확정</b></span><i>≠</i><span>현재 최종본 <b>미확인</b></span></div>
          <p className="note">확인되지 않은 현행성을 전문 공개 판정에 섞지 않습니다.</p>
        </aside>
      </section>
    </main>
  );
}
