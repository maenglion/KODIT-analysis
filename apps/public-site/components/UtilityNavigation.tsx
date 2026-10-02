"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const informationLinks = [
  { href: "/data-purpose", label: "데이터 수집 및 활용목적" },
  { href: "/methodology", label: "검증 방법론" },
  { href: "/technical-specs", label: "기술 사양" },
];

export function UtilityNavigation() {
  const pathname = usePathname();
  return <nav className="utility-inner" aria-label="서비스 정보">
    {informationLinks.map(({ href, label }) => <Link key={href} href={href} className={pathname === href ? "active" : ""} aria-current={pathname === href ? "page" : undefined}>{label}</Link>)}
  </nav>;
}
