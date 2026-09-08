import type { Metadata } from "next";
import Link from "next/link";
import "./styles.css";

export const metadata: Metadata = {
  title: "KODIT 규정 아카이브",
  description: "신용보증기금 공식 자료의 출처와 판정 근거를 함께 확인합니다.",
};

const nav = [
  ["홈", "/"],
  ["규정·법령", "/regulations"],
  ["투자·보증", "/investment-guarantee"],
  ["통계", "/statistics"],
  ["기사·외부자료", "/articles"],
  ["방법론·변경공지", "/methodology"],
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <header className="site-header">
          <div className="header-inner">
            <Link className="brand" href="/" aria-label="KODIT 규정 아카이브 홈">
              <span className="brand-mark">K</span>
              <span><b>KODIT</b><small>공식자료 판정 아카이브</small></span>
            </Link>
            <nav aria-label="주 메뉴">
              {nav.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
            </nav>
          </div>
        </header>
        {children}
        <footer><span>KODIT 자료 판정 아카이브</span><span>출처·무결성·판정 근거를 함께 공개합니다.</span></footer>
      </body>
    </html>
  );
}
