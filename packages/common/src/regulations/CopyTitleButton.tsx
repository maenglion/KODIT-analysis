"use client";
import { useState } from "react";

export function CopyTitleButton({ title }: { title: string }) {
  const [status, setStatus] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(title);
      setStatus("복사됨");
    } catch {
      setStatus("복사 실패 — 제목을 선택해 복사해 주세요");
    }
  }
  return <><button type="button" className="copy-title-button" title="제목 복사" aria-label={`${title} 제목 복사`} onClick={copy}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="1.5"/><path d="M16 8V4H4v12h4"/></svg></button><small className="sr-only" role="status" aria-live="polite">{status}</small></>;
}
