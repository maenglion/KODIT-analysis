"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export function SiteNavigation() {
  const pathname = usePathname();
  const search = useSearchParams();
  const scope = search.get("scope") ?? "master";
  const isRegulations = pathname === "/regulations" || pathname === "/" || pathname.startsWith("/regulations/");
  const isDepartment = pathname === "/department-statistics";
  const isResidual = pathname === "/residual-data";

  return <>
    <nav className="main-navigation" aria-label="주 메뉴">
      <Link className={isRegulations ? "active" : ""} aria-current={isRegulations ? "page" : undefined} href="/regulations">규정·법령</Link>
      <Link className={isDepartment ? "active" : ""} aria-current={isDepartment ? "page" : undefined} href="/department-statistics">부서별 통계</Link>
      <Link className={pathname === "/investment-statistics" ? "active" : ""} aria-current={pathname === "/investment-statistics" ? "page" : undefined} href="/investment-statistics">사업별 통계</Link>
      <Link className={isResidual ? "active" : ""} aria-current={isResidual ? "page" : undefined} href="/residual-data">잔차 데이터</Link>
    </nav>
    {isRegulations && <nav className="sub-navigation" aria-label="규정 하위 메뉴">
      <Link className={scope === "master" ? "active" : ""} aria-current={scope === "master" ? "page" : undefined} href="/regulations?scope=master">내부규정(분석)</Link>
      <Link className={scope === "notice" ? "active" : ""} aria-current={scope === "notice" ? "page" : undefined} href="/regulations?scope=notice">사규예고</Link>
      <Link href="/department-statistics#organization-history">조직도</Link>
    </nav>}
    {isDepartment && <nav className="sub-navigation" aria-label="부서 통계 하위 메뉴">
      <a href="#summary">요약</a>
      <a href="#semantic-method">시맨틱 매칭방식</a>
      <a href="#organization-history">조직 히스토리</a>
    </nav>}
    {isResidual && <nav className="sub-navigation" aria-label="잔차 데이터 하위 메뉴">
      <a href="#residual-index">담당 표기 잔차</a>
      <a href="/department-statistics#organization-history">확인된 기능 이동</a>
    </nav>}
  </>;
}
