import { availabilityLabels, type Availability } from "./index";

const flow = [
  { label: "공식 근거", detail: "공식 게시물·ALIO 원문·첨부의 출처와 게시 시점을 보존" },
  { label: "형식 검증", detail: "PDF·HWP·HWPX의 형식·SHA·본문 추출 기록을 각각 남김" },
  { label: "버전별 판정", detail: "동일 규정 버전에 대해 공식 표현물 하나라도 전문이 검증되면 전문 공개" },
  { label: "담당 표기", detail: "게시물 담당 명칭과 기준 조직명을 정확히 비교; 불일치 표기는 잔차로 분리" },
  { label: "근거 연결", detail: "본문 mention·라벨·공식 조직 근거를 별도로 평가; 유사도만으로 승계 확정 금지" },
];

export function DepartmentEvidenceGuide({ scope, availability }: { scope: string; availability: Record<Availability, number> }) {
  return <section className="department-method" id="semantic-method" aria-labelledby="department-method-title">
    <div className="department-method-heading"><div><p className="eyebrow">공개 상태는 하나의 점수가 아닙니다</p><h2 id="department-method-title">시맨틱 매칭과 공개 범위</h2></div><a href="/methodology">검증 방법론 자세히 ↗</a></div>
    <p>{scope}의 규정 버전 공개 상태와 담당 표기 해석은 서로 다른 판정입니다. 파일 파싱 성공을 곧바로 전문 공개나 현행성 확정으로 바꾸지 않습니다.</p>
    <ol className="department-method-flow">{flow.map((item, index) => <li key={item.label}><span>0{index + 1}</span><strong>{item.label}</strong><p>{item.detail}</p></li>)}</ol>
    <div className="department-method-status"><b>{scope}의 버전별 공개 플래그</b><div>{(["FULLTEXT_PUBLIC", "PARTIAL_PUBLIC", "NOTICE_ONLY", "SOURCE_UNKNOWN"] as Availability[]).map((state) => <span key={state} className={`status-flag status-${state.toLowerCase()}`}>{availabilityLabels[state]} {availability[state]}건</span>)}</div></div>
    <p className="department-method-caution">‘사전예고만’은 전문이 없다고 확정한 값이 아니고, ‘출처불명’은 검증 불가/중단으로 자동 환산하지 않습니다. 조직명 유사도 역시 실제 조직 이동을 증명하지 않습니다. <a href="/residual-data">담당 표기 잔차 살펴보기 ↗</a></p>
  </section>;
}
