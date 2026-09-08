import Link from "next/link";

export default function Home() {
  return (
    <main className="shell home">
      <p className="eyebrow">검증 가능한 공공정보</p>
      <h1>원문뿐 아니라<br /><em>판정의 이유</em>까지.</h1>
      <p className="lead">신용보증기금 규정과 자료를 공식 출처, 파일 무결성, 검증 이력과 함께 제공합니다.</p>
      <Link className="primary-link" href="/regulations/investment-option-guarantee">첫 공개 규정 확인하기 <span>→</span></Link>
    </main>
  );
}
