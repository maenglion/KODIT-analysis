"use client";

import Link from "next/link";
import { useState } from "react";

export function SiteNavigation() {
  const [pendingOpen, setPendingOpen] = useState(false);

  return <>
    <nav aria-label="주 메뉴">
      <Link href="/regulations">규정·법령</Link>
      <Link href="/department-statistics">부서별 통계</Link>
      <button className="nav-pending" type="button" onClick={() => setPendingOpen(true)}>투자·보증 통계</button>
      <Link href="/technical-specs">기술 스펙</Link>
    </nav>
    {pendingOpen && <div className="nav-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPendingOpen(false); }}>
      <section className="nav-modal" role="dialog" aria-modal="true" aria-labelledby="pending-title">
        <button className="nav-modal-close" type="button" aria-label="닫기" onClick={() => setPendingOpen(false)}>×</button>
        <p className="eyebrow">투자·보증 통계</p>
        <h2 id="pending-title">준비중입니다.</h2>
      </section>
    </div>}
  </>;
}
