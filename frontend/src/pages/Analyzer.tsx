import { useEffect, useRef, useState } from "react";
import { Dna, Eraser, Info, Link2, ListChecks, ScanSearch, ShieldAlert, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import { api, ApiError, CATEGORY_LABELS, LANGUAGE_LABELS, MAX_CHARS, type Example, type Prediction } from "../services/api";
import { Badge, Button, Card, Empty, ErrorBox, Spinner, confPct } from "../components/ui";
import { ConfidenceBar } from "../components/charts";
import { HighlightedText, HighlightLegend } from "../components/HighlightedText";

export default function Analyzer({ onSendToLab }: { onSendToLab: (text: string) => void }) {
  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [result, setResult] = useState<Prediction | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [examples, setExamples] = useState<Example[]>([]);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { api.examples().then((r) => setExamples(r.examples)).catch(() => setExamples([])); }, []);

  // deep link: #analyzer?text=... (used for screenshots / demos); runs real inference
  useEffect(() => {
    const q = new URLSearchParams(window.location.hash.split("?")[1] ?? "");
    const t = q.get("text");
    if (t) { setText(t); void analyze(t); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function analyze(input = text) {
    const msg = input.trim();
    if (!msg) { setError("Paste a message to analyse."); return; }
    if (msg.length > MAX_CHARS) { setError(`Messages are limited to ${MAX_CHARS} characters.`); return; }
    setLoading(true); setError(null);
    try {
      const r = await api.predict(input);
      setResult(r); setSubmitted(input);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Unexpected error.");
      setResult(null);
    } finally { setLoading(false); }
  }

  const over = text.length > MAX_CHARS;
  const groups = Array.from(new Set(examples.map((e) => e.group)));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="space-y-6">
        <Card title="Message Analyzer" icon={<ScanSearch className="h-4 w-4" />}>
          <label htmlFor="msg" className="sr-only">Message text</label>
          <textarea id="msg" ref={ref} value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void analyze(); }}
            placeholder="Paste an SMS or WhatsApp message here…" rows={8}
            className="w-full resize-y rounded-lg border border-line bg-navy/60 p-3 text-[15px] leading-6 text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none" />
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className={over ? "text-scam" : "text-ink-3"}>{text.length.toLocaleString()} / {MAX_CHARS.toLocaleString()} characters</span>
            <span className="hidden text-ink-3 sm:inline">Ctrl + Enter to analyse</span>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button onClick={() => analyze()} disabled={loading || !text.trim() || over}>
              {loading ? <Spinner label="Analysing" /> : <><ScanSearch className="h-4 w-4" />Analyse</>}
            </Button>
            <Button variant="outline" onClick={() => { setText(""); setResult(null); setError(null); ref.current?.focus(); }} disabled={loading || (!text && !result)}>
              <Eraser className="h-4 w-4" />Clear
            </Button>
            <div className="ml-auto">
              <label htmlFor="ex" className="sr-only">Load an example message</label>
              <select id="ex" value="" onChange={(e) => { const ex = examples.find((x) => x.id === e.target.value); if (ex) { setText(ex.text); setResult(null); } }}
                className="rounded-lg border border-line-2 bg-surface-2 px-3 py-2 text-sm text-ink-2 focus:outline-none">
                <option value="">Load example…</option>
                {groups.map((g) => <optgroup key={g} label={g}>{examples.filter((e) => e.group === g).map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}</optgroup>)}
              </select>
            </div>
          </div>
          <p className="mt-4 flex items-start gap-2 text-xs text-ink-3"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />Analysis runs on this computer. The message is not stored or sent anywhere.</p>
        </Card>
        {error && <ErrorBox message={error} onRetry={text.trim() ? () => analyze() : undefined} />}
        {result && <ScamDNA result={result} />}
      </div>

      <div className="space-y-6">
        {!result && !loading && (
          <Card><Empty icon={<ShieldCheck className="h-6 w-6" />} title="No message analysed yet">Paste a message or load an example. You will see a verdict, scam category, calibrated confidence and the evidence behind it.</Empty></Card>
        )}
        {loading && !result && <Card><div className="py-16 text-center"><Spinner label="Running local models…" /></div></Card>}
        {result && <Result result={result} text={submitted} onSendToLab={() => onSendToLab(submitted)} />}
      </div>
    </div>
  );
}

function Result({ result: r, text, onSendToLab }: { result: Prediction; text: string; onSendToLab: () => void }) {
  const scam = r.verdict === "SCAM";
  return (
    <div className="space-y-6 fade-in">
      <section className={`card overflow-hidden ${scam ? "border-scam/50" : "border-safe/40"}`} aria-live="polite">
        <div className={`flex flex-wrap items-center gap-4 p-5 ${scam ? "bg-scam-bg" : "bg-safe-bg"}`}>
          <div className={`rounded-xl p-3 ${scam ? "bg-scam/15 text-scam" : "bg-safe/15 text-safe"}`}>
            {scam ? <ShieldAlert className="h-8 w-8" aria-hidden /> : <ShieldCheck className="h-8 w-8" aria-hidden />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium uppercase tracking-wider text-ink-3">Verdict</div>
            <div className={`text-3xl font-bold tracking-tight ${scam ? "text-scam" : "text-safe"}`}>{r.verdict}</div>
          </div>
          <div className="grid grid-cols-2 gap-6 text-sm">
            <div>
              <div className="text-xs text-ink-3">Category</div>
              <div className="font-semibold text-ink">{r.category ? CATEGORY_LABELS[r.category] : "—"}</div>
            </div>
            <div>
              <div className="text-xs text-ink-3">Confidence</div>
              <div className="font-semibold tabular-nums text-ink">{confPct(r.confidence)}</div>
            </div>
          </div>
        </div>
        <div className="space-y-4 p-5">
          <div>
            <ConfidenceBar value={r.confidence} tone={scam ? "scam" : "safe"} />
            <p className="mt-2 text-xs text-ink-3">{r.confidence_interpretation.text}</p>
          </div>
          {r.borderline && <div className="flex items-start gap-2 rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm text-ink"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" />Borderline score — the evidence is mixed. Verify through an official channel before acting.</div>}
          <p className="text-[15px] leading-7 text-ink">{r.explanation}</p>
          <div className="flex flex-wrap gap-2">
            <Badge tone="info">{LANGUAGE_LABELS[r.language] ?? r.language}</Badge>
            <Badge>scam probability {confPct(r.scam_probability)}</Badge>
            <Badge>{r.latency_ms.toFixed(0)} ms on this device</Badge>
            {Object.values(r.obfuscation).some((v) => v > 0) && <Badge tone="warn">obfuscation detected</Badge>}
          </div>
        </div>
      </section>

      <Card title="Evidence in the message" icon={<Sparkles className="h-4 w-4" />}
        action={<Button variant="ghost" onClick={onSendToLab} title="Test this message in the Mutation Lab"><Dna className="h-4 w-4" />Stress-test</Button>}>
        <div className="rounded-lg border border-line bg-navy/50 p-4"><HighlightedText text={text} highlights={r.highlights} /></div>
        <div className="mt-3"><HighlightLegend /></div>
        {r.normalized_text.trim() !== text.trim() && (
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-ink-2 hover:text-ink">Show normalised text (after de-obfuscation)</summary>
            <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-surface-2 p-3 font-mono text-xs text-ink-2">{r.normalized_text}</p>
          </details>
        )}
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Risk signals" icon={<Link2 className="h-4 w-4" />}>
          {r.risk_signals.length === 0 ? <p className="text-sm text-ink-3">No structural risk signals (links, numbers, payment details). Absence of signals is not proof of safety.</p> : (
            <ul className="space-y-3">
              {r.risk_signals.map((s, i) => (
                <li key={i} className="text-sm">
                  <div className="flex items-center gap-2"><SeverityDot sev={s.severity} /><span className="font-medium text-ink">{s.label}</span><span className="text-xs text-ink-3">{s.severity}</span></div>
                  <p className="ml-4 mt-0.5 text-ink-3">{s.detail}</p>
                </li>
              ))}
            </ul>
          )}
          {r.benign.templates.length > 0 && (
            <div className="mt-4 border-t border-line pt-4">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-3">Genuine-message patterns</div>
              <ul className="space-y-1 text-sm text-ink-2">{r.benign.descriptions.map((d) => <li key={d} className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-safe" />{d}</li>)}</ul>
            </div>
          )}
          {r.benign.conflict && <p className="mt-3 rounded-lg border border-scam/40 bg-scam-bg p-3 text-sm text-ink">Conflict: {r.benign.conflict_reasons.join("; ")}.</p>}
        </Card>
        <Card title="What drove the decision" icon={<ListChecks className="h-4 w-4" />}>
          <ul className="space-y-2">
            {r.key_factors.map((f) => (
              <li key={f.feature} className="text-sm">
                <div className="flex items-center justify-between gap-2"><span className="text-ink">{f.label}</span>
                  <span className={`text-xs tabular-nums ${f.contribution > 0 ? "text-scam" : "text-safe"}`}>{f.contribution > 0 ? "+" : ""}{f.contribution.toFixed(2)}</span></div>
                <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-surface-3">
                  <div className={f.contribution > 0 ? "bg-scam" : "bg-safe"} style={{ width: `${Math.min(100, Math.abs(f.contribution) * 12)}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-ink-3">Contributions to the fusion model's log-odds, relative to an average training message (+ towards SCAM, − towards SAFE). {r.evidence_note}</p>
        </Card>
      </div>
    </div>
  );
}

function SeverityDot({ sev }: { sev: string }) {
  const c = sev === "high" ? "bg-scam" : sev === "medium" ? "bg-warn" : sev === "low" ? "bg-[#8cb8f0]" : "bg-ink-3";
  return <span className={`inline-block h-2 w-2 rounded-full ${c}`} aria-hidden />;
}

function ScamDNA({ result: r }: { result: Prediction }) {
  const strengthTone = { strong: "scam", moderate: "warn", weak: "neutral" } as const;
  return (
    <Card title="Scam DNA — manipulation tactics" icon={<Dna className="h-4 w-4" />}>
      {r.tactics.length === 0 ? (
        <p className="text-sm text-ink-3">No manipulation tactics were detected in the wording.</p>
      ) : (
        <ul className="space-y-4">
          {r.tactics.map((t) => (
            <li key={t.id}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-ink">{t.label}</span>
                <Badge tone={strengthTone[t.strength]}>{t.strength}</Badge>
              </div>
              <p className="mt-1 text-sm text-ink-3">{t.description}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {t.evidence.map((e, i) => <span key={i} className="rounded border border-line-2 bg-surface-2 px-2 py-0.5 font-mono text-xs text-ink-2">“{e.text}”</span>)}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 border-t border-line pt-3 text-xs text-ink-3">Strength is a documented rule-based level (weak = single cue; moderate = several cues or a cue plus a link/number; strong = moderate plus an action request) — not a probability. Matches are observed wording, not proof of intent.</p>
    </Card>
  );
}
