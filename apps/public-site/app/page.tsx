import Link from "next/link";

export default function Home() {
  return (
    <main className="shell home">
      <p className="eyebrow">검증 가능한 공공정보</p>
      <h1>신용보증기금<br /><em>규정, 자료 검증</em></h1>
      <p className="lead">출처, 무결성, 검증 이력 및 판정 이유 제공</p>
      <Link className="primary-link" href="/regulations/investment-option-guarantee">첫 공개 규정 확인하기 <span>→</span></Link>
    </main>
  );
}
