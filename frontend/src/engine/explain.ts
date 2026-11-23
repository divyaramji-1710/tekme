// Port of backend/explainability/explainer.py: template-based explanations, exact key factors, highlights.
import { RULES, get } from "./rules";
import { WB, escapeRe, finditer, pyRound } from "./py";
import type { EngineOutput, Highlight, KeyFactor } from "./types";

const { TACTIC_PHRASES, SIGNAL_PHRASES, FEATURE_LABELS } = RULES.explainer;
const STRENGTH_ORDER: Record<string, number> = { strong: 0, moderate: 1, weak: 2 };

export function joinList(items: string[]): string {
  if (!items.length) return "";
  if (items.length === 1) return items[0];
  return items.slice(0, -1).join(", ") + " and " + items[items.length - 1];
}

export function confidenceInterpretation(conf: number, verdict: string): { level: string; text: string } {
  const level = conf >= 0.9 ? "high" : conf >= 0.75 ? "moderately high" : conf >= 0.6 ? "moderate" : "low";
  const share = conf >= 0.995 ? "over 99%" : `roughly ${pyRound(conf * 100)}%`;
  return {
    level,
    text: `${level[0].toUpperCase() + level.slice(1)} confidence. The score is calibrated on held-out validation data: `
      + `messages that received a similar score were ${verdict} ${share} of the time.`,
  };
}

const unique = <T,>(xs: T[]) => [...new Set(xs)];

export function explain(
  r: { verdict: "SCAM" | "SAFE"; confidence: number; category: string | null; category_label: string | null; borderline: boolean },
  out: EngineOutput, contributions: [string, number][], words: { terms: { term: string; contribution: number }[] },
) {
  const hits = [...out.tacticHits].sort((a, b) => STRENGTH_ORDER[a.strength] - STRENGTH_ORDER[b.strength]);
  const sigIds = out.signals.map((s) => s.id);
  const rep = out.benign;
  const sentences: string[] = [];
  if (r.verdict === "SCAM") {
    const tparts = hits.slice(0, 3).map((h) => TACTIC_PHRASES[h.id]);
    let sids = unique(sigIds);
    if (sids.includes("lookalike_domain") && sids.includes("brand_domain_mismatch")) sids = sids.filter((s) => s !== "brand_domain_mismatch");
    const sparts = sids.filter((s) => get(SIGNAL_PHRASES, s) !== undefined).map((s) => SIGNAL_PHRASES[s]).slice(0, 2);
    if (rep.conflict) sentences.push("Although it is formatted like a routine notification, it " + joinList(rep.conflict_reasons) + " - a common scam pattern.");
    if (tparts.length || sparts.length) sentences.push("This message " + joinList([...tparts, ...sparts]) + ".");
    else sentences.push("No single explicit tactic stands out, but the wording closely resembles known scam messages in the training data.");
    if (r.category_label && r.category !== "OTHER") sentences.push(`Its content matches the ${r.category_label} scam pattern.`);
    sentences.push("Do not click links, call numbers or share codes from this message; contact the organisation through its official app or website instead.");
  } else {
    const descr = rep.templates.map((t, i) => [t, rep.descriptions[i]] as const).filter(([t]) => t !== "safety_advice").map(([, d]) => d);
    if (descr.length) sentences.push("This message appears to be a " + descr[0][0].toLowerCase() + descr[0].slice(1) + ".");
    else sentences.push("The wording resembles ordinary, legitimate messages.");
    if (rep.safety_advice && (rep.templates.includes("otp_notification") || sigIds.includes("otp_mention")))
      sentences.push("It carries standard safety advice and does not ask you to share the code.");
    if (hits.length) sentences.push("Some cues were noticed (" + joinList(hits.slice(0, 2).map((h) => h.label.toLowerCase())) + "), but the overall evidence points to a genuine message.");
    else sentences.push("No manipulation tactics were detected.");
    const risky = unique(sigIds).filter((s) => get(SIGNAL_PHRASES, s) !== undefined).map((s) => SIGNAL_PHRASES[s]);
    if (risky.length) sentences.push("Note: it " + joinList(risky.slice(0, 2)) + ", so stay cautious.");
  }
  if (r.borderline) sentences.push("The evidence is mixed and the score is close to the decision threshold; treat this verdict with caution and verify through an official channel.");

  const factors: KeyFactor[] = [];
  for (const [name, c] of contributions) {
    if (Math.abs(c) < 0.05 || factors.length >= 6) continue;
    factors.push({ feature: name, label: get(FEATURE_LABELS, name) ?? name, contribution: pyRound(c, 3), direction: c > 0 ? "towards SCAM" : "towards SAFE" });
  }
  return {
    explanation: sentences.join(" "),
    confidence_interpretation: confidenceInterpretation(r.confidence, r.verdict),
    key_factors: factors,
    semantic_terms: words.terms,
    highlights: highlights(out, words),
    evidence_note: "Key factors are the fusion model's own per-feature contributions. Highlighted tactics and signals are rule-based supporting evidence, not a full account of the model's reasoning.",
  };
}

function highlights(out: EngineOutput, words: { terms: { term: string; contribution: number }[] }): Highlight[] {
  type C = [number, number, number, Highlight["kind"], string];
  const cands: C[] = [];
  for (const h of out.tacticHits) for (const e of h.evidence) cands.push([e.start, e.end, 0, "tactic", h.label]);
  for (const s of out.signals) for (const e of s.evidence) cands.push([e.start, e.end, 1, "signal", s.label]);
  for (const e of out.benign.evidence) cands.push([e.start, e.end, 2, "benign", "Genuine-message pattern"]);
  const text = out.pre.original;
  const low = text.toLowerCase();
  for (const t of words.terms.slice(0, 6)) {
    const term = t.term;
    if (t.contribution <= 0 || [...term].length < 3 || (term.startsWith("x") && term.endsWith("x"))) continue;
    for (const m of finditer(new RegExp(WB + escapeRe(term) + WB, "gu"), low)) cands.push([m.start, m.end, 3, "term", "Scam-associated wording (text model)"]);
  }
  cands.sort((a, b) => a[2] - b[2] || a[0] - b[0]);
  const chosen: C[] = [];
  for (const c of cands) {
    if (c[1] <= c[0]) continue;
    if (chosen.some((a) => !(c[1] <= a[0] || c[0] >= a[1]))) continue;
    chosen.push(c);
  }
  const cmp = (a: C, b: C) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || (a[3] < b[3] ? -1 : a[3] > b[3] ? 1 : 0) || (a[4] < b[4] ? -1 : a[4] > b[4] ? 1 : 0);
  return chosen.sort(cmp).map(([start, end, , kind, label]) => ({ start, end, kind, label, text: text.slice(start, end) }));
}
