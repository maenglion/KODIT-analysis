"use client";

import { useId, useState } from "react";

export type InsightTextPart = string | { termId: string };
export type InsightTerm = { id: string; label: string; short: string; detail: string };
export type InsightMetric = { termId: string; value: string };

type Props = {
  eyebrow?: string;
  title: string;
  description: InsightTextPart[];
  metrics: InsightMetric[];
  disclosureTerms: InsightTerm[];
  href: string;
  linkLabel: string;
  evidenceBasis: string;
  note: string;
};

export function PublicInsightStrip({ eyebrow, title, description, metrics, disclosureTerms, href, linkLabel, evidenceBasis, note }: Props) {
  const uid = useId();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<string | null>(null);
  const terms = new Map(disclosureTerms.map(term => [term.id, term]));
  const active = expanded ? terms.get(expanded) : null;
  const detailId = `${uid}-detail`;

  const termButton = (termId: string) => {
    const term = terms.get(termId);
    if (!term) throw new Error(`인사이트 도움말 누락: ${termId}`);
    const tooltipId = `${uid}-${termId}-short`;
    const isExpanded = expanded === termId;
    return <span className="public-insight-term" key={termId} onMouseEnter={() => setTooltip(termId)} onMouseLeave={() => setTooltip(current => current === termId ? null : current)}>
      <button type="button" aria-expanded={isExpanded} aria-controls={detailId} aria-describedby={tooltipId}
        onFocus={() => setTooltip(termId)} onBlur={() => setTooltip(current => current === termId ? null : current)}
        onClick={() => { setExpanded(isExpanded ? null : termId); setTooltip(null); }}>{term.label}</button>
      <span id={tooltipId} role="tooltip" className="public-insight-tooltip" hidden={tooltip !== termId || isExpanded}>{term.short}</span>
    </span>;
  };

  return <section className="shell public-insight-shell" aria-label={title} onKeyDown={event => {
    if (event.key === "Escape") { setExpanded(null); setTooltip(null); }
  }}>
    <div className="public-insight">
      <div className="public-insight-main">
        <div className="public-insight-copy">
          <div className="public-insight-title">{eyebrow && <span>{eyebrow}</span>}<h2>{title}</h2></div>
          <p>{description.map((part, index) => typeof part === "string" ? <span key={index}>{part}</span> : <span key={index}>{termButton(part.termId)}</span>)}</p>
        </div>
        <a className="public-insight-link" href={href}>{linkLabel} <span aria-hidden="true">→</span></a>
      </div>
      <div className="public-insight-bottom">
        <p className="public-insight-metrics"><strong>후속 검토</strong> {metrics.map((metric, index) => <span key={metric.termId}>{index > 0 && <span aria-hidden="true"> · </span>}{termButton(metric.termId)} {metric.value}</span>)}</p>
        <p className="public-insight-note">{note}</p>
      </div>
      <div className="public-insight-detail" id={detailId} role="region" aria-label={active ? `${active.label} 설명` : "용어 설명"} hidden={!active}>
        {active && <><strong>{active.label}</strong><p>{active.detail}</p></>}
      </div>
      <p className="public-insight-basis">{evidenceBasis}</p>
    </div>
  </section>;
}
