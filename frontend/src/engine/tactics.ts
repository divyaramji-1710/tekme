// Port of backend/engines/tactics.py (Scam DNA).
import { RULES } from "./rules";
import { cpAfter, cpBefore, finditer, rx, test } from "./py";
import { span, type Preprocessed, type Span } from "./preprocess";

export type Strength = "weak" | "moderate" | "strong";
export interface TacticHit { id: string; label: string; description: string; strength: Strength; evidence: Span[]; rationale: string }

const T = RULES.tactics;
export const TACTIC_IDS = T.list.map((t) => t.id);
export const TACTIC_META = Object.fromEntries(T.list.map((t) => [t.id, { label: t.label, description: t.description }]));

function negated(text: string, start: number, end: number): boolean {
  const before = cpBefore(text, start, 45);
  const after = cpAfter(text, end, 30);
  return test(rx(T.NEGATION_RE), before) || test(rx(T.NEGATION_AFTER_RE), after);
}

export function detect(pre: Preprocessed): TacticHit[] {
  const text = pre.normalized;
  const hasAction = test(rx(T.ACTION_RE), text);
  const hasUrl = pre.urls.length > 0 || !!pre.placeholders["url"];
  const structural = !!(pre.urls.length || pre.phones.length || pre.upi_ids.length || pre.emails.length
    || pre.placeholders["url"] || pre.placeholders["phone"]);
  const hits: TacticHit[] = [];
  for (const t of T.list) {
    const spans: [number, number][] = [];
    let distinct = 0;
    t.cues.forEach((cue, ci) => {
      if (t.id === "link" && ci === 1 && !hasUrl) return;
      let found = false;
      for (const m of finditer(rx(cue), text)) {
        const s = m.start, e = m.end;
        if ((t.id === "sensitive_info" || t.id === "payment" || t.id === "link") && negated(text, s, e)) continue;
        if (spans.some(([a, b]) => !(e <= a || s >= b))) continue;
        spans.push([s, e]);
        found = true;
      }
      if (found) distinct++;
    });
    if (spans.length) hits.push(score(t, pre, spans, distinct, hasAction, structural));
  }
  const active = new Set(hits.map((h) => h.id));
  const out: TacticHit[] = [];
  for (const h of hits) {
    if (h.id === "authority") {
      const pressure = ["threat", "sensitive_info", "payment", "link", "urgency"].filter((x) => active.has(x)).sort();
      if (!pressure.length) continue;
      h.rationale = "Mentions an institution or brand together with " + pressure.join(", ").replace(/_/g, " ")
        + "; genuine institutions rarely combine these in one SMS.";
    }
    out.push(h);
  }
  return out;
}

function score(t: { id: string; label: string; description: string }, pre: Preprocessed, spans: [number, number][],
  distinct: number, hasAction: boolean, structural: boolean): TacticHit {
  let strength: Strength;
  if (distinct >= 2 || (distinct === 1 && structural)) {
    strength = "moderate";
    if (hasAction && distinct >= 2 && structural) strength = "strong";
  } else strength = "weak";
  const sorted = [...spans].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const evidence = sorted.map(([s, e]) => span(pre, s, e)).slice(0, 5);
  let rationale = `${spans.length} cue(s) from ${distinct} distinct pattern group(s)`;
  if (structural) rationale += ", alongside a link/phone/payment identifier";
  return { id: t.id, label: t.label, description: t.description, strength, evidence, rationale: rationale + "." };
}

export function tacticFeatures(hits: TacticHit[]): Record<string, number> {
  const level: Record<Strength, number> = { weak: 1, moderate: 2, strong: 3 };
  const f: Record<string, number> = {};
  for (const id of TACTIC_IDS) f[`tactic_${id}`] = 0;
  for (const h of hits) f[`tactic_${h.id}`] = level[h.strength];
  f.tactic_count = hits.length;
  f.tactic_strong_count = hits.filter((h) => h.strength === "strong").length;
  return f;
}
