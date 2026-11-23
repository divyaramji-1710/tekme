import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Clock, FileUp, IndianRupee, Link2, MessageSquareText } from "lucide-react";
import { analyse, type Analysis } from "../analysis/analyze";
import { addHistory } from "../analysis/store";
import { go, useApp } from "../app/context";
import examplesJson from "../engine/generated/examples.json";
import { Button, ErrorBox, Panel } from "./ui";
import { EvidenceDossier, VerdictBanner } from "./result";
import { MarkLoader } from "../brand/EvidenceMark";

export const MAX_CHARS = 2000;
export interface Example { id: string; group: string; title: string; text: string }
export const EXAMPLES = (examplesJson as { examples: Example[] }).examples;
type Mode = "message" | "url" | "upi";
const PLACEHOLDER: Record<Mode, string> = {
  message: "Paste an SMS or WhatsApp message…",
  url: "Paste a link exactly as it appears (it is never opened)…",
  upi: "Paste a UPI ID or the payment request text…",
};

export function useAnalysis() {
  const { engine, intel, settings } = useApp();
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = useCallback((text: string, sender?: string) => {
    if (!engine) return;
    const t = text.trim();
    if (!t) { setError("Paste a message first."); return; }
    if (text.length > MAX_CHARS) { setError(`Messages are limited to ${MAX_CHARS.toLocaleString()} characters.`); return; }
    setBusy(true); setError(null);
    // let React paint the busy state before the synchronous analysis
    setTimeout(() => {
      try {
        const a = analyse(engine, intel, text, { sender, lang: settings.lang });
        setAnalysis(a);
        if (settings.history) addHistory({ text, verdict: a.core.verdict, display: a.uncertainty.display_verdict, category: a.core.category, confidence: a.core.confidence }, settings.retentionDays);
      } catch (e) {
        setError("Analysis failed on this device: " + (e as Error).message);
      } finally { setBusy(false); }
    }, 16);
  }, [engine, intel, settings.lang, settings.history, settings.retentionDays]);
  return { analysis, setAnalysis, error, busy, run, ready: !!engine };
}

export function MessageInput({ text, setText, mode, setMode, onAnalyze, busy, disabled, showModes = true, id = "message" }: {
  text: string; setText: (s: string) => void; mode: Mode; setMode: (m: Mode) => void; onAnalyze: () => void; busy: boolean; disabled: boolean; showModes?: boolean; id?: string;
}) {
  const over = text.length > MAX_CHARS;
  return (
    <div>
      <label htmlFor={id} className="sr-only">Message to analyse</label>
      <div className="rounded-xl border border-line-2 bg-bg-2 focus-within:border-accent">
        <textarea id={id} value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder={PLACEHOLDER[mode]}
          onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") onAnalyze(); }}
          className="block w-full resize-y rounded-xl bg-transparent px-4 pt-3.5 text-[0.98rem] leading-relaxed text-ink outline-none placeholder:text-ink-3"
          aria-describedby={`${id}-count`} spellCheck={false} />
        <div id={`${id}-count`} className={`px-4 pb-2 text-right text-xs tabular-nums ${over ? "font-semibold text-scam" : "text-ink-3"}`}>{text.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}</div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        {showModes && (
          <div className="flex flex-wrap gap-2.5" role="group" aria-label="Input type">
            <Button variant={mode === "message" ? "tab-active" : "tab"} onClick={() => setMode("message")}><MessageSquareText className="h-4 w-4" aria-hidden />Message</Button>
            <Button variant={mode === "url" ? "tab-active" : "tab"} onClick={() => setMode("url")}><Link2 className="h-4 w-4" aria-hidden />URL</Button>
            <Button variant={mode === "upi" ? "tab-active" : "tab"} onClick={() => setMode("upi")}><IndianRupee className="h-4 w-4" aria-hidden />UPI ID</Button>
            <Button variant="tab" onClick={() => go("batch")}><FileUp className="h-4 w-4" aria-hidden />Batch</Button>
          </div>
        )}
        <Button variant="analyze" className="ml-auto" onClick={onAnalyze} disabled={busy || disabled || !text.trim() || over}>
          {busy ? "Analysing…" : "Analyze Now"} <ArrowRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

export function ExampleChips({ onPick }: { onPick: (t: string) => void }) {
  return (
    <div className="mt-4">
      <div className="mb-2 text-xs text-ink-3">Try an example (written for this demo; links use reserved <code>.example</code> domains):</div>
      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((e) => (
          <button key={e.id} onClick={() => onPick(e.text)} className={`rounded-full border px-3 py-1 text-xs font-medium hover:bg-surface-2 ${e.group === "Scam" ? "border-scam/40 text-ink" : "border-safe/40 text-ink"}`}>
            <span className={e.group === "Scam" ? "text-scam" : "text-safe"} aria-hidden>●</span> {e.title}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Home-page pair: analyzer card + compact result card, matching the approved layout. */
export function AnalyzerPair() {
  const { status, error: loadError, retry } = useApp();
  const { analysis, error, busy, run, ready } = useAnalysis();
  const [text, setText] = useState(EXAMPLES.find((e) => e.id === "kyc_en")?.text ?? "");
  const [mode, setMode] = useState<Mode>("message");
  const ran = useRef(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (ready && !ran.current && text) { ran.current = true; run(text); } }, [ready, run, text]);
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(i); }, []);
  const ago = analysis ? Math.max(0, Math.round((now - Date.parse(analysis.analysed_at)) / 60000)) : 0;
  return (
    <>
      <Panel className="min-w-0 flex-1" as="div">
        <h2 className="font-display text-[2.35rem] font-semibold leading-tight text-ink">Message Analyzer</h2>
        <p className="mb-4 mt-1 text-[0.95rem] text-ink-2">Paste any SMS or WhatsApp message to detect and analyse potential fraud — on this device.</p>
        <MessageInput text={text} setText={setText} mode={mode} setMode={setMode} onAnalyze={() => run(text)} busy={busy} disabled={!ready} id="home-message" />
        {error && <div className="mt-3"><ErrorBox message={error} /></div>}
        <ExampleChips onPick={(t) => { setText(t); run(t); }} />
      </Panel>
      <Panel className="w-full min-w-0 xl:w-[490px] xl:shrink-0" as="div">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-[1.7rem] font-semibold text-ink">Analysis Result</h2>
          {analysis && <span className="flex items-center gap-1.5 text-sm text-ink-2"><Clock className="h-4 w-4" aria-hidden />Analysed {ago === 0 ? "just now" : `${ago} min ago`}</span>}
        </div>
        {status === "loading" && <MarkLoader label="Loading the on-device model…" />}
        {status === "error" && <ErrorBox message={loadError ?? "The model failed to load."} onRetry={retry} />}
        {status === "ready" && !analysis && !busy && <p className="py-8 text-center text-sm text-ink-3">Results appear here. Nothing is sent anywhere.</p>}
        {busy && !analysis && <MarkLoader label="Analysing…" />}
        {analysis && (
          <div className="fade-in space-y-3">
            <VerdictBanner a={analysis} compact />
            <h3 className="pt-1 font-display text-[1.35rem] font-semibold text-ink">Evidence Dossier</h3>
            <EvidenceDossier a={analysis} limit={4} />
            <div className="grid grid-cols-2 gap-3 pt-1">
              <Button variant="outline" onClick={() => go("analyze", { text: analysis.input.text })}>View Full Analysis <ArrowRight className="h-4 w-4" aria-hidden /></Button>
              <Button variant="outline" onClick={() => go("analyze", { text: analysis.input.text, focus: "guidance" })}>Safety Guidance</Button>
            </div>
          </div>
        )}
      </Panel>
    </>
  );
}
