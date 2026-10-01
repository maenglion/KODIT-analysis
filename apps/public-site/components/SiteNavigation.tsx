"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export function SiteNavigation() {
  const pathname = usePathname();
  const search = useSearchParams();
  const scope = search.get("scope") ?? "master";
  const isRegulations = pathname === "/regulations";
  const isDepartment = pathname === "/department-statistics";

  return <>
    <nav className="main-navigation" aria-label="주 메뉴">
      <Link className={isRegulations ? "active" : ""} href="/regulations">HOME</Link>
      <Link href="/regulations">규정·법령</Link>
      <Link className={isDepartment ? "active" : ""} href="/department-statistics">부서별 통계</Link>
      <Link className={pathname === "/investment-statistics" ? "active" : ""} href="/investment-statistics">사업별 통계</Link>
    </nav>
    {isRegulations && <nav className="sub-navigation" aria-label="규정 하위 메뉴">
      <Link className={scope === "master" ? "active" : ""} href="/regulations?scope=master">내부규정(분석)</Link>
      <Link className={scope === "notice" ? "active" : ""} href="/regulations?scope=notice">사규예고</Link>
      <Link href="/department-statistics">조직도</Link>
    </nav>}
    {isDepartment && <nav className="sub-navigation" aria-label="부서 통계 하위 메뉴">
      <a className="active" href="#summary">요약</a>
      <a href="#residual-analysis">시맨틱 매칭방식</a>
      <a href="#organization-history">조직 히스토리</a>
    </nav>}
  </>;
}
