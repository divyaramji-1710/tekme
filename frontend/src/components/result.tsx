import { useMemo, useState, type ReactNode } from "react";
import {
  CircleAlert, CircleCheck, CircleHelp, Clock, Fingerprint, Landmark, Link2, Lock, IndianRupee, MessageCircle, Phone, Shield,
  ShieldCheck, ThumbsDown, ThumbsUp, TriangleAlert, Zap, Gift, Briefcase, KeyRound, EyeOff, HeartCrack,
} from "lucide-react";
import type { Analysis } from "../analysis/analyze";
import { addFeedback } from "../analysis/store";
import { useApp } from "../app/context";
import type { Highlight } from "../engine/types";
import { Chip, confPct, levelLabel, levelTone, Note, type Tone } from "./ui";

export const CATEGORY_LABEL: Record<string, string> = { KYC_BANK: "Bank / KYC Fraud", LOTTERY_PRIZE: "Lottery / Prize", LOAN_CREDIT: "Loan / Credit", JOB_INVESTMENT: "Job / Investment", OTHER: "Other scam" };
const TACTIC_ICON: Record<string, typeof Clock> = {
  urgency: Clock, threat: TriangleAlert, authority: Landmark, reward: Gift, sensitive_info: KeyRound, payment: IndianRupee,
  link: Link2, job_investment: Briefcase, emotional: HeartCrack, secrecy: EyeOff,
};

export function verdictMeta(a: Analysis): { label: string; tone: Tone; Icon: typeof CircleAlert } {
  const d = a.uncertainty.display_verdict;
  if (d === "UNCERTAIN") return { label: a.core.verdict === "SCAM" ? "Uncertain · leans scam" : "Uncertain · leans safe", tone: "uncertain", Icon: CircleHelp };
  return d === "SCAM" ? { label: "Suspected Scam", tone: "scam", Icon: CircleAlert } : { label: "Likely Safe", tone: "safe", Icon: CircleCheck };
}

export function VerdictBanner({ a, compact = false }: { a: Analysis; compact?: boolean }) {
  const m = verdictMeta(a);
  const bg = { scam: "border-scam/50 bg-scam-bg", safe: "border-safe/50 bg-safe-bg", uncertain: "border-uncertain/50 bg-uncertain-bg" }[m.tone as "scam"];
  const ink = { scam: "text-scam", safe: "text-safe", uncertain: "text-uncertain" }[m.tone as "scam"];
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-4 ${compact ? "py-3" : "py-3.5"} ${bg}`} role="status" aria-live="polite">
      <m.Icon className={`h-7 w-7 shrink-0 ${ink}`} strokeWidth={2.2} aria-hidden />
      <span className={`font-display ${compact ? "text-[1.55rem]" : "text-[1.75rem]"} font-semibold leading-none ${ink}`}>{m.label}</span>
      <span className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-sm">
        {a.core.category && <span className={`font-semibold ${ink}`}>{CATEGORY_LABEL[a.core.category]}</span>}
        <span className="text-ink">Confidence: <b className="tabular-nums">{confPct(a.core.confidence)}</b></span>
      </span>
    </div>
  );
}

export function ConfidenceMeter({ a }: { a: Analysis }) {
  const p = a.core.scam_probability;
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-xs text-ink-3"><span>Safe</span><span>Calibrated scam probability: <b className="text-ink">{confPct(p)}</b></span><span>Scam</span></div>
      <div className="relative h-2.5 rounded-full bg-surface-3" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p * 100)} aria-label="Calibrated scam probability">
        <div className="absolute inset-y-0 rounded-full bg-uncertain/30" style={{ left: "35%", width: "30%" }} title="Borderline band (35–65%)" />
        <div className="absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded bg-ink-3" style={{ left: "50%" }} title="Decision threshold (50%)" />
        <div className={`absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface ${a.core.verdict === "SCAM" ? "bg-scam" : "bg-safe"}`} style={{ left: `${p * 100}%` }} />
      </div>
      <p className="mt-2 text-[0.82rem] leading-relaxed text-ink-3">{a.core.confidence_interpretation.text}</p>
    </div>
  );
}

interface Row { icon: ReactNode; label: string; detail: string; level: string; key: string }
export function dossierRows(a: Analysis): Row[] {
  const rows: Row[] = [];
  const ic = (I: typeof Clock) => <I className="h-[18px] w-[18px]" strokeWidth={1.7} aria-hidden />;
  for (const b of a.brands) if (b.link_relation !== "official") rows.push({ key: "b" + b.brand, icon: ic(Landmark), label: "Impersonation", detail: b.short, level: b.link_relation === "none" ? "medium" : "high" });
  for (const u of a.urls) {
    const top = u.indicators.filter((i) => i.level !== "info").sort((x, y) => ["high", "medium", "low"].indexOf(x.level) - ["high", "medium", "low"].indexOf(y.level))[0];
    if (top) rows.push({ key: "u" + u.url, icon: ic(Link2), label: top.level === "high" ? "Malicious-looking link" : "Link warning", detail: `${top.label}: ${u.host || u.url}`, level: top.level });
    else if (u.official_for) rows.push({ key: "u" + u.url, icon: ic(ShieldCheck), label: "Official domain", detail: `${u.registered_domain} is on the local list (not a guarantee)`, level: "info" });
  }
  const st: Record<string, string> = { strong: "high", moderate: "medium", weak: "low" };
  for (const t of a.core.tactics) {
    const ev = t.evidence[0]?.text;
    rows.push({ key: "t" + t.id, icon: ic(TACTIC_ICON[t.id] ?? Zap), label: t.label.replace(" / brand impersonation", ""), detail: ev ? `“${ev.length > 48 ? ev.slice(0, 46) + "…" : ev}”` : t.description, level: st[t.strength] });
  }
  const URL_SIGNALS = new Set(["shortened_link", "ip_link", "suspicious_tld", "lookalike_domain", "many_subdomains", "punycode", "at_in_url", "defanged_link", "brand_domain_mismatch", "official_domain"]);
  for (const s of a.core.risk_signals) if (s.severity !== "info" && !URL_SIGNALS.has(s.id)) rows.push({ key: "s" + s.id, icon: ic(s.id === "call_request" ? Phone : s.id === "messaging_app" ? MessageCircle : s.id === "upi_id" ? IndianRupee : TriangleAlert), label: s.label, detail: s.detail, level: s.severity });
  for (const p of a.payment.indicators) rows.push({ key: "p" + p.id, icon: ic(IndianRupee), label: p.label, detail: p.detail, level: p.level });
  if (a.core.benign.conflict) rows.push({ key: "conflict", icon: ic(Shield), label: "Genuine shell, malicious ask", detail: a.core.benign.conflict_reasons[0], level: "high" });
  if (a.core.category && a.core.category !== "OTHER" && a.core.verdict === "SCAM") rows.push({ key: "cat", icon: ic(Fingerprint), label: a.core.category === "KYC_BANK" ? "KYC Bait" : CATEGORY_LABEL[a.core.category], detail: "Common pattern in " + CATEGORY_LABEL[a.core.category].toLowerCase() + " campaigns", level: "medium" });
  if (a.core.verdict === "SAFE") for (const [i, d] of a.core.benign.descriptions.entries()) rows.push({ key: "g" + i, icon: ic(ShieldCheck), label: "Genuine pattern", detail: d, level: "info" });
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.label + r.detail) ? false : (seen.add(r.label + r.detail), true)));
}

export function EvidenceDossier({ a, limit }: { a: Analysis; limit?: number }) {
  const rows = dossierRows(a);
  const shown = limit ? rows.slice(0, limit) : rows;
  if (!rows.length) return <p className="py-3 text-sm text-ink-3">No manipulation tactics, risky links or payment requests were found.</p>;
  return (
    <div className="overflow-hidden rounded-xl border border-line">
      <table className="w-full text-left text-[0.84rem]">
        <caption className="sr-only">Evidence found in the message</caption>
        <tbody>
          {shown.map((r) => (
            <tr key={r.key} className="border-b border-line last:border-0">
              <td className="w-8 py-2.5 pl-3 text-ink-2">{r.icon}</td>
              <th scope="row" className="w-[34%] py-2.5 pr-2 font-medium text-ink">{r.label}</th>
              <td className="py-2.5 pr-2 text-ink-2">{r.detail}</td>
              <td className="py-2.5 pr-3 text-right"><Chip tone={levelTone(r.level)}>{levelLabel(r.level)}</Chip></td>
            </tr>
          ))}
        </tbody>
      </table>
      {limit && rows.length > limit && <div className="border-t border-line px-3 py-2 text-xs text-ink-3">+{rows.length - limit} more in the full analysis</div>}
    </div>
  );
}

const HL_MEANING: Record<Highlight["kind"], string> = {
  tactic: "A manipulation tactic detected by the Scam DNA rules.",
  signal: "A structural risk signal (link, number, payment detail or disguised text).",
  benign: "A pattern typical of genuine service messages.",
  term: "Wording the text model associates with scams (statistical, not a rule).",
};
/** Interactive evidence heatmap: every highlight is focusable and explains itself. */
export function EvidenceHeatmap({ a }: { a: Analysis }) {
  const [sel, setSel] = useState<number | null>(null);
  const text = a.input.text;
  const hs = useMemo(() => [...a.core.highlights].sort((x, y) => x.start - y.start), [a]);
  const parts: ReactNode[] = [];
  let pos = 0;
  hs.forEach((h, i) => {
    if (h.start < pos || h.end > text.length) return;
    if (h.start > pos) parts.push(<span key={`t${i}`}>{text.slice(pos, h.start)}</span>);
    parts.push(
      <mark key={`h${i}`} className={`hl hl-${h.kind}`} tabIndex={0} role="button" aria-pressed={sel === i}
        aria-label={`${h.text}: ${h.label}`} onClick={() => setSel(sel === i ? null : i)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSel(sel === i ? null : i); } }}>
        {text.slice(h.start, h.end)}
      </mark>,
    );
    pos = h.end;
  });
  if (pos < text.length) parts.push(<span key="end">{text.slice(pos)}</span>);
  const s = sel !== null ? hs[sel] : null;
  return (
    <div>
      <p className="whitespace-pre-wrap break-words rounded-xl border border-line bg-bg-2 p-4 text-[0.98rem] leading-8 text-ink">{parts}</p>
      <div className="mt-2 min-h-[3.2rem]" aria-live="polite">
        {s ? (
          <div className="rounded-lg border border-line bg-surface-2 p-3 text-sm"><b className="text-ink">{s.label}</b> — <span className="text-ink-2">{HL_MEANING[s.kind]}</span></div>
        ) : (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
            {(["tactic", "signal", "benign", "term"] as const).map((k) => <span key={k} className="flex items-center gap-1.5"><mark className={`hl hl-${k} px-2`}>&nbsp;</mark>{{ tactic: "Manipulation tactic", signal: "Risk signal", benign: "Genuine pattern", term: "Model wording" }[k]}</span>)}
            <span>· Select a highlight to see what it means.</span>
          </div>
        )}
      </div>
    </div>
  );
}

const TACTIC_ORDER = ["urgency", "threat", "authority", "reward", "sensitive_info", "payment", "link", "job_investment", "emotional", "secrecy"];
const TACTIC_SHORT: Record<string, string> = { urgency: "Urgency", threat: "Threat", authority: "Authority", reward: "Reward", sensitive_info: "Data harvesting", payment: "Payment", link: "Link push", job_investment: "Job / invest", emotional: "Emotional", secrecy: "Secrecy" };
export function ScamDNA({ a }: { a: Analysis }) {
  const by = Object.fromEntries(a.core.tactics.map((t) => [t.id, t]));
  const lvl: Record<string, number> = { weak: 1, moderate: 2, strong: 3 };
  return (
    <div>
      <ul className="grid grid-cols-1 gap-y-2.5" aria-label="Scam DNA: strength of each manipulation tactic">
        {TACTIC_ORDER.map((id) => {
          const t = by[id];
          const n = t ? lvl[t.strength] : 0;
          const I = TACTIC_ICON[id];
          return (
            <li key={id} className="flex items-center gap-3" title={t ? `${t.label}: ${t.strength}. ${t.rationale}` : "Not detected"}>
              <I className={`h-4 w-4 shrink-0 ${n ? "text-accent" : "text-ink-3"}`} aria-hidden />
              <span className={`w-28 shrink-0 text-sm ${n ? "font-semibold text-ink" : "text-ink-3"}`}>{TACTIC_SHORT[id]}</span>
              <span className="flex flex-1 gap-1" aria-label={t ? t.strength : "not detected"}>
                {[1, 2, 3].map((k) => <span key={k} className={`h-2 flex-1 rounded-full ${k <= n ? (n === 3 ? "bg-scam" : n === 2 ? "bg-warn" : "bg-info") : "bg-surface-3"}`} />)}
              </span>
              <span className="w-16 text-right text-xs text-ink-3">{t ? t.strength : "—"}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-ink-3">Strength is a documented rule ordinal (weak / moderate / strong), not a probability.</p>
    </div>
  );
}

export function KeyFactors({ a }: { a: Analysis }) {
  const f = a.core.key_factors;
  if (!f.length) return <p className="text-sm text-ink-3">No single feature moved the score by more than 0.05.</p>;
  const max = Math.max(...f.map((x) => Math.abs(x.contribution)));
  return (
    <ul className="space-y-2" aria-label="Fusion model key factors">
      {f.map((k) => (
        <li key={k.feature} className="grid grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] items-center gap-3 text-sm">
          <span className="text-ink-2 leading-snug">{k.label}</span>
          <span className="flex items-center gap-2">
            <span className="relative h-2.5 flex-1 rounded-full bg-surface-3">
              <span className={`absolute inset-y-0 rounded-full ${k.contribution > 0 ? "left-1/2 bg-scam" : "right-1/2 bg-safe"}`} style={{ width: `${(Math.abs(k.contribution) / max) * 50}%` }} />
              <span className="absolute inset-y-[-3px] left-1/2 w-px bg-ink-3" />
            </span>
            <span className="w-14 text-right text-xs tabular-nums text-ink-3">{k.contribution > 0 ? "+" : ""}{k.contribution.toFixed(2)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Explanation({ a }: { a: Analysis }) {
  const { settings, update } = useApp();
  const hi = settings.lang === "hinglish";
  return (
    <div>
      <div className="mb-2 flex items-center gap-2" role="group" aria-label="Explanation language">
        {(["en", "hinglish"] as const).map((l) => (
          <button key={l} onClick={() => update({ lang: l })} aria-pressed={settings.lang === l}
            className={`rounded-md px-2.5 py-1 text-xs font-semibold ${settings.lang === l ? "bg-accent text-on-accent" : "border border-line-2 text-ink-2 hover:text-ink"}`}>{l === "en" ? "English" : "Hinglish"}</button>
        ))}
      </div>
      <p className="text-[0.98rem] leading-relaxed text-ink" lang={hi ? "hi-Latn" : "en"}>{hi ? a.explanation_hinglish : a.core.explanation}</p>
      {a.uncertainty.reasons.length > 0 && <div className="mt-3"><Note tone="uncertain">{a.uncertainty.reasons.join(" ")}</Note></div>}
    </div>
  );
}

export function GuidancePanel({ a }: { a: Analysis }) {
  const g = a.guidance;
  const tone = g.tier.startsWith("scam") ? "text-scam" : g.tier === "uncertain" ? "text-uncertain" : "text-safe";
  return (
    <div>
      <p className={`font-semibold ${tone}`}>{g.headline}</p>
      <ol className="mt-3 space-y-2">
        {g.steps.map((s) => (
          <li key={s.id} className="flex gap-2.5 text-sm leading-relaxed text-ink">
            {s.urgent ? <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-label="Based on evidence in this message" /> : <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />}
            {s.text}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs leading-relaxed text-ink-3">{g.report}</p>
    </div>
  );
}

export function FeedbackBar({ a }: { a: Analysis }) {
  const { engine } = useApp();
  const [sent, setSent] = useState<null | "SCAM" | "SAFE">(null);
  const give = (label: "SCAM" | "SAFE") => {
    addFeedback({ text: a.input.text, predicted: a.core.verdict, scam_probability: a.core.scam_probability, user_label: label, correct: label === a.core.verdict, model_version: engine?.manifest.model_version ?? "" });
    setSent(label);
  };
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-ink-3">Was this right?</span>
      {sent ? <span className="text-ink-2" role="status">Saved on this device only. It does not retrain the model (see Privacy Center).</span> : (
        <>
          <button onClick={() => give(a.core.verdict)} className="inline-flex items-center gap-1.5 rounded-lg border border-line-2 px-3 py-1.5 text-ink hover:bg-surface-2"><ThumbsUp className="h-4 w-4" aria-hidden />Correct</button>
          <button onClick={() => give(a.core.verdict === "SCAM" ? "SAFE" : "SCAM")} className="inline-flex items-center gap-1.5 rounded-lg border border-line-2 px-3 py-1.5 text-ink hover:bg-surface-2"><ThumbsDown className="h-4 w-4" aria-hidden />Wrong — it is {a.core.verdict === "SCAM" ? "safe" : "a scam"}</button>
        </>
      )}
    </div>
  );
}

export function FamiliarityNote({ a }: { a: Analysis }) {
  const f = a.familiarity;
  if (!f) return null;
  return (
    <div className="flex items-start gap-2 text-xs text-ink-3">
      {f.unfamiliar ? <CircleHelp className="h-4 w-4 shrink-0 text-uncertain" aria-hidden /> : <Lock className="h-4 w-4 shrink-0" aria-hidden />}
      <span>{f.unfamiliar ? `Unfamiliar message: ${f.reasons.join("; ")}.` : "Familiar message: close to patterns seen in training."} Cluster similarity {f.similarity.toFixed(2)}, known-word coverage {(f.coverage * 100).toFixed(0)}%.</span>
    </div>
  );
}
export { MessageCircle, Phone };
