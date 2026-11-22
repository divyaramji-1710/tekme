import type { Highlight } from "../services/api";

/** Renders the ORIGINAL message with evidence spans returned by the backend. */
export function HighlightedText({ text, highlights }: { text: string; highlights: Highlight[] }) {
  const parts: React.ReactNode[] = [];
  let pos = 0;
  const sorted = [...highlights].sort((a, b) => a.start - b.start);
  sorted.forEach((h, i) => {
    if (h.start < pos || h.end > text.length) return;
    if (h.start > pos) parts.push(<span key={`t${i}`}>{text.slice(pos, h.start)}</span>);
    parts.push(
      <mark key={`h${i}`} className={`hl-${h.kind}`} title={h.label}>
        {text.slice(h.start, h.end)}
        <span className="sr-only"> ({h.label})</span>
      </mark>,
    );
    pos = h.end;
  });
  if (pos < text.length) parts.push(<span key="end">{text.slice(pos)}</span>);
  return <p className="whitespace-pre-wrap break-words text-[15px] leading-7 text-ink">{parts}</p>;
}

export function HighlightLegend() {
  const items = [
    ["hl-tactic", "Manipulation tactic"],
    ["hl-signal", "Risk signal"],
    ["hl-benign", "Genuine-message pattern"],
    ["hl-term", "Scam-associated wording (text model)"],
  ];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
      {items.map(([c, l]) => <span key={c} className="flex items-center gap-1.5"><mark className={`${c} px-2`}>&nbsp;</mark>{l}</span>)}
    </div>
  );
}
