"use client";

import { useEffect, useRef } from "react";

export function MobileViewingNotice() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    try { if (window.sessionStorage.getItem("kodit-pc-view-notice")) return; } catch { /* Storage can be disabled. */ }
    dialogRef.current?.showModal();
  }, []);
  const rememberDismissal = () => {
    try { window.sessionStorage.setItem("kodit-pc-view-notice", "dismissed"); } catch { /* Continue without persistence. */ }
  };
  const dismiss = () => {
    rememberDismissal();
    dialogRef.current?.close();
  };
  return <dialog className="pc-view-notice" ref={dialogRef} aria-labelledby="pc-view-title" aria-describedby="pc-view-description" onClose={rememberDismissal}>
    <div className="pc-view-notice-mark">PC · TABLET VIEW</div>
    <h2 id="pc-view-title">PC·태블릿 화면에 최적화되어 있습니다</h2>
    <p id="pc-view-description">모바일에서도 같은 웹 화면을 볼 수 있습니다. 화면을 좌우로 움직여 표와 다이어그램을 확인하거나, 더 넓은 화면에서 이용해 주세요.</p>
    <button type="button" onClick={dismiss}>알겠습니다 · 화면 보기</button>
  </dialog>;
}
