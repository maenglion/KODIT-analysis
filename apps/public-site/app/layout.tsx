import type { Metadata } from "next";
import Link from "next/link";
import "./styles.css";

export const metadata: Metadata = {
  title: "KODIT 규정 아카이브",
  description: "신용보증기금 공식 자료의 출처와 판정 근거를 함께 확인합니다.",
};

const nav = [
  ["규정·법령", "/regulations"],
  ["부서별 통계", "/department-statistics"],
  ["투자·보증 통계", "/investment-statistics"],
  ["기술 스펙", "/technical-specs"],
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/fonts-archive/Paperlogy/subsets/Paperlogy-dynamic-subset.css"
        />
      </head>
      <body>
        <header className="site-header">
          <div className="header-inner">
            <Link className="brand" href="/regulations" aria-label="KODIT 규정 공개현황">
              <span className="brand-mark">K</span>
              <span><b>KODIT</b><small>규정 공개·검증 시스템</small></span>
            </Link>
            <nav aria-label="주 메뉴">
              {nav.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
            </nav>
          </div>
        </header>
        {children}
        <footer><span>KODIT 규정 공개현황</span><span>Soulspectrum Inc. · nanyoung이 만들었습니다.</span></footer>
      </body>
    </html>
  );
}
