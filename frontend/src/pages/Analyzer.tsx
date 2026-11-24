import { useEffect, useRef, useState } from "react";
import { Download, Fingerprint, History, Info, ListChecks, Microscope, ScanSearch, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { go, useApp } from "../app/context";
import { PageHeader } from "../components/Shell";
import { ExampleChips, MessageInput, useAnalysis } from "../components/AnalyzerWidget";
import { CATEGORY_LABEL, ConfidenceMeter, EvidenceDossier, EvidenceHeatmap, Explanation, FamiliarityNote, FeedbackBar, GuidancePanel, KeyFactors, ScamDNA, VerdictBanner } from "../components/result";
import { Button, Chip, Empty, ErrorBox, Panel, confPct, levelTone } from "../components/ui";
import { MarkLoader } from "../brand/EvidenceMark";
import { redact } from "../analysis/redact";
import { download } from "../analysis/batch";
import { clearHistory, loadHistory, type HistoryItem } from "../analysis/store";
import type { Analysis } from "../analysis/analyze";
import type { InputMode } from "../analysis/identifier";
import { IdentifierResult } from "../components/IdentifierResult";

export function exportReport(a: Analysis, opt: Parameters<typeof redact>[1] | null): string {
  const r = (t: string) => (opt ? redact(t, opt) : t);
  const lines = [
    `# TEKMĒ analysis report`, ``,
    `- Analysed: ${a.analysed_at} (on this device, model ${a.model_version})`,
    `- Verdict: ${a.uncertainty.display_verdict} (model verdict ${a.core.verdict}, calibrated confidence ${confPct(a.core.confidence)})`,
    `- Category: ${a.core.category ? CATEGORY_LABEL[a.core.category] : "—"}`,
    `- Redaction: ${opt ? Object.entries(opt).filter(([, v]) => v).map(([k]) => k).join(", ") || "none" : "none"}`, ``,
    `## Message`, "", "> " + r(a.input.text).replace(/\n/g, "\n> "), ``,
    `## Explanation`, "", a.core.explanation, ``,
    `## Tactics`, "", ...(a.core.tactics.length ? a.core.tactics.map((t) => `- ${t.label} (${t.strength})${opt ? "" : ": " + t.evidence.map((e) => `“${e.text}”`).join(", ")}`) : ["- none detected"]), ``,
    `## Risk signals`, "", ...(a.core.risk_signals.length ? a.core.risk_signals.map((s) => `- [${s.severity}] ${s.label}${opt ? "" : ": " + s.detail}`) : ["- none"]), ``,
    `## Guidance`, "", `**${a.guidance.headline}**`, ...a.guidance.steps.map((s) => `- ${s.text}`), ``,
    `_Generated offline by TEKMĒ. Rule findings are supporting evidence; the verdict is a calibrated statistical estimate, not proof._`,
  ];
  return lines.join("\n");
}

/** JSON export. With redaction on, only redacted text is included: no evidence spans, hosts or normalised text. */
export function exportJson(a: Analysis, opt: Parameters<typeof redact>[1] | null) {
  const r = (t: string) => (opt ? redact(t, opt) : t);
  return {
    format: "tekme-analysis/1", analysed_at: a.analysed_at, model_version: a.model_version, redacted: !!opt,
    message: r(a.input.text),
    verdict: a.core.verdict, display_verdict: a.uncertainty.display_verdict, category: a.core.category,
    calibrated_confidence: a.core.confidence, scam_probability: a.core.scam_probability, borderline: a.core.borderline,
    uncertainty_reasons: a.uncertainty.reasons,
    tactics: a.core.tactics.map((t) => ({ id: t.id, label: t.label, strength: t.strength, ...(opt ? {} : { evidence: t.evidence }) })),
    risk_signals: a.core.risk_signals.map((s) => ({ id: s.id, label: s.label, severity: s.severity, ...(opt ? {} : { detail: s.detail, evidence: s.evidence }) })),
    link_indicators: a.urls.map((u) => ({ ...(opt ? {} : { url: u.url, host: u.host }), risk: u.risk, indicators: u.indicators.map((i) => i.id) })),
    payment_indicators: a.payment.indicators.map((i) => i.id),
    brand_claims: a.brands.map((b) => ({ brand: b.brand, link_relation: b.link_relation })),
    explanation: a.core.explanation, key_factors: a.core.key_factors, guidance: a.guidance,
  };
}

function HistoryPanel({ onPick }: { onPick: (t: string) => void }) {
  const { settings } = useApp();
  const [items, setItems] = useState<HistoryItem[]>(() => loadHistory(settings.retentionDays));
  useEffect(() => { const i = setInterval(() => setItems(loadHistory(settings.retentionDays)), 2000); return () => clearInterval(i); }, [settings.retentionDays]);
  if (!settings.history) return (
    <Panel title="Local history" icon={<History className="h-5 w-5" />}>
      <p className="text-sm text-ink-2">History is off. When enabled in <a className="text-accent underline" href="#/settings">Settings</a>, analysed messages are kept only in this browser for {settings.retentionDays} day(s).</p>
    </Panel>
  );
  return (
    <Panel title="Local history" icon={<History className="h-5 w-5" />} action={items.length ? <Button variant="ghost" onClick={() => { clearHistory(); setItems([]); }}><Trash2 className="h-4 w-4" aria-hidden />Clear</Button> : undefined}>
      {!items.length ? <p className="text-sm text-ink-3">No saved analyses yet.</p> : (
        <ul className="max-h-72 space-y-1.5 overflow-y-auto scroll-thin">
          {items.map((h) => (
            <li key={h.id}><button onClick={() => onPick(h.text)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2">
              <Chip tone={h.display === "SCAM" ? "scam" : h.display === "SAFE" ? "safe" : "uncertain"}>{h.display}</Chip>
              <span className="truncate text-ink-2">{h.text}</span>
            </button></li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export default function AnalyzerPage({ params }: { params: URLSearchParams }) {
  const { status, error: loadError, retry, settings, engine } = useApp();
  const { analysis: a, check, error, busy, run, ready } = useAnalysis();
  const [text, setText] = useState(params.get("text") ?? "");
  const [sender, setSender] = useState("");
  const initialMode = params.get("mode");
  const [mode, setMode] = useState<InputMode>(initialMode === "url" || initialMode === "upi" ? initialMode : "message");
  const [redactOn, setRedactOn] = useState(true);
  const guidanceRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  useEffect(() => {
    if (ready && !started.current && params.get("text")) { started.current = true; run(params.get("text")!, undefined, mode); }
  }, [ready, params, run, mode]);
  useEffect(() => { if (a && params.get("focus") === "guidance") guidanceRef.current?.scrollIntoView({ behavior: "smooth" }); }, [a, params]);

  return (
    <div>
      <PageHeader eyebrow="Message analyzer" title="Analyse one message">
        Verdict, category, calibrated confidence and the evidence behind them. Everything is computed by the model inside this browser{engine ? ` (loaded in ${Math.round(engine.loadMs)} ms)` : ""}; the message never leaves the device.
      </PageHeader>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          <Panel as="div">
            <MessageInput text={text} setText={setText} mode={mode} setMode={setMode} onAnalyze={() => run(text, sender, mode)} busy={busy} disabled={!ready} id="analyzer-message" />
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer text-ink-2">Optional: sender ID (e.g. AD-BANKXX or a phone number)</summary>
              <label className="mt-2 block text-xs text-ink-3" htmlFor="sender">Used only for sender checks; it does not change the model's verdict.</label>
              <input id="sender" value={sender} onChange={(e) => setSender(e.target.value)} className="mt-1 w-full rounded-lg border border-line-2 bg-bg-2 px-3 py-2 text-ink" placeholder="Sender as shown in Messages" />
            </details>
            <ExampleChips onPick={(t) => { setText(t); run(t, sender); }} />
            {error && <div className="mt-3"><ErrorBox message={error} /></div>}
          </Panel>

          {status === "loading" && <MarkLoader label="Loading the on-device model…" />}
          {status === "error" && <ErrorBox message={loadError ?? "Model failed to load"} onRetry={retry} />}
          {!a && !check && status === "ready" && !busy && <Panel as="div"><Empty icon={<ScanSearch className="h-6 w-6" />} title="No message analysed yet">Paste a message above or pick an example.</Empty></Panel>}
          {busy && !a && !check && <MarkLoader label="Analysing…" />}
          {check && <Panel as="div" className="fade-in"><IdentifierResult c={check} /></Panel>}

          {a && (
            <div className="fade-in space-y-5">
              <Panel as="div">
                <VerdictBanner a={a} />
                <div className="mt-4"><ConfidenceMeter a={a} /></div>
                <div className="mt-5"><Explanation a={a} /></div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                  <FamiliarityNote a={a} />
                  <span className="text-xs text-ink-3">Language: {a.core.language} · {a.core.latency_ms.toFixed(1)} ms on this device</span>
                </div>
              </Panel>
              <Panel title="Evidence heatmap" icon={<Sparkles className="h-5 w-5" />}><EvidenceHeatmap a={a} /></Panel>
              <div className="grid gap-5 lg:grid-cols-2">
                <Panel title="Scam DNA" icon={<Fingerprint className="h-5 w-5" />}><ScamDNA a={a} /></Panel>
                <Panel title="Why the model decided" icon={<ListChecks className="h-5 w-5" />}>
                  <KeyFactors a={a} />
                  <p className="mt-3 text-xs leading-relaxed text-ink-3">{a.core.evidence_note}</p>
                </Panel>
              </div>
              <Panel title="Evidence dossier" icon={<Microscope className="h-5 w-5" />} action={<Button variant="ghost" onClick={() => go("forensics", { text: a.input.text })}>Open in Forensics</Button>}>
                <EvidenceDossier a={a} />
                {a.core.category_probabilities && (
                  <div className="mt-4">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-3">Category probabilities</div>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(a.core.category_probabilities).sort((x, y) => y[1] - x[1]).map(([k, v]) => <Chip key={k} tone={k === a.core.category ? "accent" : "neutral"}>{CATEGORY_LABEL[k]} {(v * 100).toFixed(0)}%</Chip>)}
                    </div>
                  </div>
                )}
              </Panel>
              <div ref={guidanceRef}><Panel title="What to do" icon={<ShieldCheck className="h-5 w-5" />}><GuidancePanel a={a} /></Panel></div>
              <Panel as="div"><FeedbackBar a={a} /></Panel>
            </div>
          )}
        </div>
        <aside className="space-y-5">
          {a && (
            <Panel title="Export" icon={<Download className="h-5 w-5" />}>
              <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={redactOn} onChange={(e) => setRedactOn(e.target.checked)} /> Redact phone numbers, UPI IDs, links, e-mails and long numbers</label>
              <p className="mt-1 text-xs text-ink-3">Redaction options are set in <a className="underline" href="#/settings">Settings</a>. Files are created in your browser.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => download("tekme-report.md", exportReport(a, redactOn ? settings.redact : null), "text/markdown")}>Markdown</Button>
                <Button variant="outline" onClick={() => download("tekme-report.json", JSON.stringify(exportJson(a, redactOn ? settings.redact : null), null, 1), "application/json")}>JSON</Button>
              </div>
            </Panel>
          )}
          {a && a.urls.length > 0 && (
            <Panel title="Links" icon={<Info className="h-5 w-5" />}>
              <ul className="space-y-2 text-sm">{a.urls.map((u) => <li key={u.url}><div className="break-all font-mono text-xs text-ink">{u.url}</div><div className="mt-1 flex flex-wrap gap-1">{u.indicators.slice(0, 4).map((i) => <Chip key={i.id} tone={levelTone(i.level)}>{i.label}</Chip>)}</div></li>)}</ul>
            </Panel>
          )}
          <HistoryPanel onPick={(t) => { setText(t); run(t); }} />
        </aside>
      </div>
    </div>
  );
}
