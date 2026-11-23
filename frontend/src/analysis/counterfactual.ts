// Counterfactual sensitivity tests: remove one kind of evidence from the ORIGINAL text, re-run the full
// on-device model, and report how the calibrated probability moves. This measures model sensitivity; it
// does not prove that the removed element "caused" anything in the real world.
import type { Engine } from "../engine/engine";
import { WB, escapeRe, finditer } from "../engine/py";
import { RULES } from "../engine/rules";
import { brandsMentioned } from "../engine/trust";
import type { EngineOutput, Span, Verdict } from "../engine/types";

export interface Counterfactual {
  id: string; label: string; removed: string[]; text: string;
  before: number; after: number; delta: number; verdict_before: Verdict; verdict_after: Verdict; flips: boolean;
}
export interface CounterfactualReport { edits: Counterfactual[]; minimal_flip: { ids: string[]; labels: string[]; after: number } | null; note: string }

function removeSpans(text: string, spans: Span[]): string {
  const sorted = [...spans].filter((s) => s.end > s.start).sort((a, b) => a.start - b.start);
  const merged: Span[] = [];
  for (const s of sorted) {
    const last = merged[merged.length - 1];
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else merged.push({ ...s });
  }
  let out = "", pos = 0;
  for (const s of merged) { out += text.slice(pos, s.start) + " "; pos = s.end; }
  return (out + text.slice(pos)).replace(/[ \t]{2,}/g, " ").trim();
}

export function candidateEdits(o: EngineOutput): { id: string; label: string; spans: Span[] }[] {
  const t = (id: string) => o.tacticHits.find((h) => h.id === id)?.evidence ?? [];
  const brandSpans: Span[] = [];
  for (const name of brandsMentioned(o.pre.normalized)) {
    for (const kw of RULES.brands[name].keywords) {
      for (const m of finditer(new RegExp(WB + escapeRe(kw.trim()) + WB, "giu"), o.pre.original)) brandSpans.push({ text: m.text, start: m.start, end: m.end });
    }
  }
  const edits = [
    { id: "links", label: "Remove links", spans: o.pre.urls },
    { id: "urgency", label: "Remove urgency wording", spans: t("urgency") },
    { id: "threat", label: "Remove threats / consequences", spans: t("threat") },
    { id: "brand", label: "Remove the brand / authority claim", spans: [...brandSpans, ...t("authority")] },
    { id: "sensitive", label: "Remove requests for OTP / PIN / details", spans: [...t("sensitive_info"), ...o.benign.evidence.filter((e) => /otp|pin|code|cvv|password/i.test(e.text) && /share|send|forward|give|tell|batao|bhejo/i.test(e.text))] },
    { id: "payment", label: "Remove payment / fee request", spans: t("payment") },
    { id: "reward", label: "Remove prize / reward promise", spans: t("reward") },
    { id: "lure", label: "Remove job / investment lure", spans: t("job_investment") },
    { id: "contact", label: "Remove phone numbers and UPI IDs", spans: [...o.pre.phones, ...o.pre.upi_ids] },
    { id: "pressure_link", label: "Remove 'click / open' instructions", spans: t("link") },
  ];
  return edits.filter((e) => e.spans.length > 0);
}

export function counterfactuals(engine: Engine, text: string): CounterfactualReport {
  const base = engine.predictLight(text, false);
  const edits = candidateEdits(base.out);
  const res: Counterfactual[] = edits.map((e) => {
    const t2 = removeSpans(text, e.spans);
    const p = engine.predictLight(t2 || " ", false);
    return {
      id: e.id, label: e.label, removed: [...new Set(e.spans.map((s) => s.text))].slice(0, 4), text: t2,
      before: base.scam_probability, after: p.scam_probability, delta: p.scam_probability - base.scam_probability,
      verdict_before: base.verdict, verdict_after: p.verdict, flips: p.verdict !== base.verdict,
    };
  });
  // Greedy search for a small set of removals that flips the verdict (largest movement first).
  let minimal: CounterfactualReport["minimal_flip"] = null;
  const towardsFlip = [...res].sort((a, b) => (base.verdict === "SCAM" ? a.delta - b.delta : b.delta - a.delta));
  const chosen: typeof edits = [];
  for (const r of towardsFlip.slice(0, 5)) {
    chosen.push(edits.find((e) => e.id === r.id)!);
    const t2 = removeSpans(text, chosen.flatMap((e) => e.spans));
    const p = engine.predictLight(t2 || " ", false);
    if (p.verdict !== base.verdict) { minimal = { ids: chosen.map((e) => e.id), labels: chosen.map((e) => e.label), after: p.scam_probability }; break; }
  }
  return {
    edits: res.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)), minimal_flip: minimal,
    note: "Each row deletes the listed words from your message and re-runs the same on-device model. It shows what the model is sensitive to, not proof of what makes a message a scam.",
  };
}
