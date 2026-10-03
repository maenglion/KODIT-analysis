"use client";

import { useId, useState } from "react";

type Props = { label: string; explanation: string; short?: string };

export function WorkTraceTerm({ label, explanation, short }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState(false);

  return <span className="work-trace-term" onKeyDown={(event) => {
    if (event.key === "Escape") { setOpen(false); setHint(false); event.stopPropagation(); }
  }}>
    <button type="button" aria-expanded={open} aria-controls={`${id}-detail`}
      aria-describedby={short ? `${id}-hint` : undefined}
      onMouseEnter={() => setHint(true)} onMouseLeave={() => setHint(false)}
      onFocus={() => setHint(true)} onBlur={() => setHint(false)}
      onClick={() => { setOpen((value) => !value); setHint(false); }}>
      {label}
    </button>
    {short && <span id={`${id}-hint`} role="tooltip" className="work-trace-hint" hidden={!hint || open}>{short}</span>}
    <span id={`${id}-detail`} className="work-trace-definition" role="region" aria-label={`${label} 설명`} hidden={!open}>
      {explanation}
    </span>
  </span>;
}
