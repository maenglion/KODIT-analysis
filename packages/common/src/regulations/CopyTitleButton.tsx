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
  return <><button type="button" className="terms-button" aria-label={`${title} 제목 복사`} onClick={copy}>제목 복사</button><small role="status" aria-live="polite">{status}</small></>;
}
