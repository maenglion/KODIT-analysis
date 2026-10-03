"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export function SiteNavigation() {
  const pathname = usePathname();
  const search = useSearchParams();
  const scope = search.get("scope") ?? "master";
  const isRegulations = pathname === "/regulations" || pathname === "/" || pathname.startsWith("/regulations/");
  const isDepartment = pathname === "/department-statistics" || pathname.startsWith("/department-statistics/");
  const isTopic = pathname === "/investment-statistics" || pathname.startsWith("/investment-statistics/");
  const isResidual = pathname === "/residual-data";

  return <>
    <nav className="main-navigation" aria-label="주 메뉴">
      <Link className={isRegulations ? "active" : ""} aria-current={pathname === "/regulations" ? "page" : undefined} href="/regulations">규정·법령</Link>
      <Link className={isDepartment ? "active" : ""} href="/department-statistics">부서별 통계</Link>
      <Link className={isTopic ? "active" : ""} href="/investment-statistics">사업별 통계</Link>
      <Link className={isResidual ? "active" : ""} aria-current={isResidual ? "page" : undefined} href="/residual-data">잔차 데이터</Link>
    </nav>
    {isRegulations && <nav className="sub-navigation" aria-label="규정 하위 메뉴">
      <Link className={scope === "master" && pathname === "/regulations" ? "active" : ""} href="/regulations?scope=master">내부규정</Link>
      <Link className={scope === "notice" && pathname === "/regulations" ? "active" : ""} href="/regulations?scope=notice">사규예고</Link>
    </nav>}
    {isDepartment && <nav className="sub-navigation" aria-label="부서 통계 하위 메뉴">
      <Link href="/department-statistics" className={pathname === "/department-statistics" ? "active" : ""} aria-current={pathname === "/department-statistics" ? "page" : undefined}>요약</Link>
      <Link href="/department-statistics/semantic-matching" className={pathname.endsWith("/semantic-matching") ? "active" : ""} aria-current={pathname.endsWith("/semantic-matching") ? "page" : undefined}>시맨틱 매칭방식</Link>
      <Link href="/department-statistics/organization-history" className={pathname.endsWith("/organization-history") ? "active" : ""} aria-current={pathname.endsWith("/organization-history") ? "page" : undefined}>조직 히스토리</Link>
    </nav>}
    {isTopic && <nav className="sub-navigation" aria-label="사업 통계 하위 메뉴">
      <Link href="/investment-statistics" className={pathname === "/investment-statistics" ? "active" : ""} aria-current={pathname === "/investment-statistics" ? "page" : undefined}>요약</Link>
      <Link href="/investment-statistics/yearly-notices" className={pathname.endsWith("/yearly-notices") ? "active" : ""} aria-current={pathname.endsWith("/yearly-notices") ? "page" : undefined}>연도별 사규예고</Link>
      <Link href="/investment-statistics/evidence-notices" className={pathname.endsWith("/evidence-notices") ? "active" : ""} aria-current={pathname.endsWith("/evidence-notices") ? "page" : undefined}>근거 사규예고</Link>
    </nav>}
    {isResidual && <nav className="sub-navigation" aria-label="잔차 데이터 하위 메뉴">
      <a href="#residual-index">담당 표기 잔차</a>
      <Link href="/department-statistics/organization-history">확인된 기능 이동</Link>
    </nav>}
  </>;
}
