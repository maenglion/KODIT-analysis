const labels: Record<string, string> = {
  regulations: "규정·법령",
  "investment-guarantee": "투자·보증",
  statistics: "통계",
  articles: "기사·외부자료",
  methodology: "방법론·변경공지",
};

export default async function Pending({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  return <main className="shell pending"><p className="eyebrow">준비중</p><h1>{labels[section] ?? "페이지"}</h1><p>검증된 자료가 준비되는 순서대로 공개합니다.</p></main>;
}
