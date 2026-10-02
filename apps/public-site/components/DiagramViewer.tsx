"use client";

import { useRef, useState } from "react";

const svgPath = "/diagrams/residual-ledger-erd.svg";
const originalWidth = 2632;
const accessibleDescription = "승인 공개본과 사규예고는 담당 표기 잔차를 낳고, 잔차는 문자열 라벨과 연결됩니다. 문서 추출의 언급도 별도 라벨과 연결됩니다. 공식 조직 근거는 조직 라벨의 평가를 뒷받침합니다. 잔차의 업무 문맥은 귀속 실행·후보·근거·경로와 연결되지만, 후보만으로 확정 조직이 되지 않습니다.";

export function DiagramViewer() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [zoom, setZoom] = useState(0);
  const open = () => { setZoom(0); dialogRef.current?.showModal(); };
  const changeZoom = (delta: number) => setZoom((current) => Math.max(50, Math.min(200, current === 0 ? 100 + delta : current + delta)));
  const imageWidth = zoom === 0 ? "100%" : `${Math.round(originalWidth * zoom / 100)}px`;

  return <section className="full-erd-panel" aria-labelledby="full-erd-title">
    <div><p className="eyebrow">SOURCE-CONTROLLED ERD</p><h2 id="full-erd-title">잔차 처리 원장 관계도</h2><p>제공된 Mermaid ERD의 테이블과 관계를 그대로 렌더링했습니다. 전체 축소도에는 필드가 작게 보이므로 확대해서 읽어 주세요. 필드명만 표시하며 실제 개인·문서 값은 포함하지 않습니다.</p><div className="full-erd-actions"><button type="button" onClick={open}>전체 ERD 확대해서 보기 ↗</button><a href={svgPath} target="_blank" rel="noopener noreferrer">SVG 원본 새 창으로 보기</a></div></div>
    <img className="full-erd-thumbnail" src={svgPath} width={520} height={430} loading="lazy" alt="잔차·라벨·조직·귀속 원장 전체 관계도 미리보기. 세부 관계는 옆 설명 또는 확대 보기를 이용하세요." />
    <p className="full-erd-description">{accessibleDescription}</p>
    <dialog ref={dialogRef} className="diagram-dialog" aria-labelledby="diagram-dialog-title" aria-describedby="diagram-dialog-description" onClick={(event) => { if (event.target === dialogRef.current) dialogRef.current?.close(); }}>
      <div className="diagram-dialog-body">
        <header className="diagram-toolbar"><div><h2 id="diagram-dialog-title">잔차 처리 원장 ERD</h2><p id="diagram-dialog-description">확대 후 가로·세로로 스크롤해 19개 엔티티의 관계를 읽을 수 있습니다.</p></div><div className="diagram-toolbar-actions"><button type="button" onClick={() => setZoom(0)} aria-label="전체 그림 맞춤">전체 맞춤</button><button type="button" onClick={() => setZoom(100)} aria-label="원본 크기로 보기">원본 100%</button><button type="button" onClick={() => changeZoom(-25)} aria-label="축소">−</button><span aria-live="polite">{zoom === 0 ? "전체" : `${zoom}%`}</span><button type="button" onClick={() => changeZoom(25)} aria-label="확대">+</button><button type="button" onClick={() => dialogRef.current?.close()} aria-label="다이어그램 닫기">닫기 ×</button></div></header>
        <div className="diagram-stage" tabIndex={0} aria-label="잔차 처리 ERD 확대 화면, 방향키로 스크롤 가능"><img src={svgPath} alt={accessibleDescription} style={{ width: imageWidth, maxWidth: "none" }} /></div>
      </div>
    </dialog>
  </section>;
}
