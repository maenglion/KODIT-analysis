import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SiteNavigation } from "@/components/SiteNavigation";
import { UtilityNavigation } from "@/components/UtilityNavigation";
import { MobileViewingNotice } from "@/components/MobileViewingNotice";
import "./styles.css";
import "./styles/regulations.css";
import "./styles/department.css";
import "./styles/residual.css";
import "./styles/topic.css";
import "./styles/information.css";
import "./styles/detail.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://letscheck-sinbo.netlify.app"),
  title: "KODIT 규정 아카이브",
  description: "신용보증기금 공식 자료의 출처와 판정 근거를 함께 확인합니다.",
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "KODIT ANALYSIS",
    title: "KODIT ANALYSIS",
    description: "신용보증기금 규정 공개현황",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "KODIT ANALYSIS" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "KODIT ANALYSIS",
    description: "신용보증기금 규정 공개현황",
    images: ["/opengraph-image"],
  },
};

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
        <div className="desktop-application">
          <header className="site-header">
            <div className="utility-bar"><UtilityNavigation /></div>
            <div className="header-blue">
              <div className="header-inner">
                <Link className="brand" href="/regulations" aria-label="KODIT 규정 공개·검증 시스템 규정 목록">KODIT - 규정 공개·검증 시스템</Link>
                <Suspense fallback={null}><SiteNavigation /></Suspense>
              </div>
            </div>
          </header>
          {children}
          <footer><span>KODIT 규정 공개현황</span><span>Soulspectrum Inc. · nanyoung이 만들었습니다.</span></footer>
        </div>
        <MobileViewingNotice />
      </body>
    </html>
  );
}
