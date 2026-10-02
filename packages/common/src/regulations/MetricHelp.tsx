"use client";

import { useId, useState, type ReactNode } from "react";

export function MetricHelp({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <span className="metric-help-wrap" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
    <button type="button" className="metric-help-trigger" aria-label={`${title} 기준 설명`} aria-describedby={open ? id : undefined} aria-expanded={open} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onClick={() => setOpen(true)} onKeyDown={(event) => { if (event.key === "Escape") { setOpen(false); event.stopPropagation(); } }}>ⓘ</button>
    {open && <span role="tooltip" id={id} className="metric-help-popover"><strong>{title}</strong><span>{children}</span></span>}
  </span>;
}
