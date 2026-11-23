import { useMemo, useRef, useState } from "react";
import { Download, FileUp, ListFilter, Square } from "lucide-react";
import { useApp } from "../app/context";
import { PageHeader } from "../components/Shell";
import { Button, Chip, ErrorBox, Note, Panel, Stat, confPct, pct } from "../components/ui";
import { CATEGORY_LABEL } from "../components/result";
import { download, parseBatch, runBatch, summarise, toCsv, type BatchResult, type BatchRow } from "../analysis/batch";

const SAMPLE = `text,label
"Your OTP for login is 482913. Do not share it with anyone.",SAFE
"Dear customer your account is blocked. Update KYC now at http://kyc-verify.example/login",SCAM
"Congratulations! You won Rs 25 lakh in KBC lucky draw. Call +91 90000 00000 to claim",SCAM
"hey, running 10 min late, order for me pls",SAFE
"Earn 5000 daily from home! Part time job, join telegram now",SCAM
"Your parcel is out for delivery today. Track in the app.",SAFE`;

type SortKey = "id" | "p" | "verdict";
export default function Batch() {
  const { engine, status, settings } = useApp();
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [meta, setMeta] = useState<{ name: string; format: string; truncated: boolean } | null>(null);
  const [results, setResults] = useState<BatchResult[]>([]);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "SCAM" | "SAFE" | "borderline" | "wrong">("all");
  const [sort, setSort] = useState<SortKey>("id");
  const [redactExport, setRedactExport] = useState(true);
  const cancel = useRef({ cancelled: false });

  const load = (name: string, content: string) => {
    const p = parseBatch(name, content);
    if (!p.rows.length) { setErr("No messages found. Use a CSV with a 'text' column, or one message per line."); return; }
    setErr(null); setRows(p.rows); setResults([]); setProgress(0); setMeta({ name, format: p.format, truncated: p.truncated });
  };
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 5_000_000) { setErr("Files up to 5 MB are supported."); return; }
    load(f.name, await f.text());
  };
  const start = async () => {
    if (!engine) return;
    cancel.current = { cancelled: false };
    setRunning(true); setResults([]); setProgress(0);
    const r = await runBatch(engine, rows, setProgress, cancel.current);
    setResults(r); setRunning(false);
  };
  const shown = useMemo(() => {
    let r = results;
    if (filter === "SCAM" || filter === "SAFE") r = r.filter((x) => x.verdict === filter);
    if (filter === "borderline") r = r.filter((x) => x.borderline);
    if (filter === "wrong") r = r.filter((x) => x.label && x.label !== x.verdict);
    return [...r].sort((a, b) => sort === "p" ? b.scam_probability - a.scam_probability : sort === "verdict" ? a.verdict.localeCompare(b.verdict) : a.id - b.id);
  }, [results, filter, sort]);
  const s = results.length ? summarise(results) : null;

  return (
    <div>
      <PageHeader eyebrow="Batch scanner" title="Scan many messages at once">
        Import a CSV (with a <code>text</code> column and an optional <code>label</code> column) or a plain-text file with one message per line. Files are read by your browser and never uploaded.
      </PageHeader>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel as="div">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line-2 bg-bg-2 px-4 py-8 text-center hover:border-accent"
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files[0]); }}>
            <FileUp className="h-8 w-8 text-accent" aria-hidden />
            <span className="font-semibold text-ink">Choose or drop a .csv / .txt file</span>
            <span className="text-xs text-ink-3">Up to 5,000 messages · 5 MB</span>
            <input type="file" accept=".csv,.txt,text/csv,text/plain" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={() => load("sample.csv", SAMPLE)}>Load a 6-message sample</Button>
            {meta && <span className="text-sm text-ink-2">{meta.name}: {rows.length.toLocaleString()} messages ({meta.format}){meta.truncated && " — truncated to 5,000"}</span>}
            {running ? <Button variant="outline" className="ml-auto" onClick={() => { cancel.current.cancelled = true; }}><Square className="h-4 w-4" aria-hidden />Stop</Button>
              : <Button variant="analyze" className="ml-auto" onClick={start} disabled={!rows.length || status !== "ready"}>Scan {rows.length ? rows.length.toLocaleString() : ""} messages</Button>}
          </div>
          {(running || progress > 0) && (
            <div className="mt-4">
              <div className="h-2 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuemin={0} aria-valuemax={rows.length} aria-valuenow={progress} aria-label="Scan progress">
                <div className="h-full bg-accent transition-[width]" style={{ width: `${(progress / Math.max(1, rows.length)) * 100}%` }} />
              </div>
              <div className="mt-1 text-xs text-ink-3" aria-live="polite">{progress.toLocaleString()} / {rows.length.toLocaleString()} analysed</div>
            </div>
          )}
          {err && <div className="mt-3"><ErrorBox message={err} /></div>}
        </Panel>
        <Panel title="Summary" icon={<ListFilter className="h-5 w-5" />}>
          {!s ? <p className="text-sm text-ink-3">Results appear after a scan.</p> : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Scam" value={s.scam.toLocaleString()} tone="scam" hint={pct(s.scam / s.n)} />
                <Stat label="Safe" value={s.safe.toLocaleString()} tone="safe" hint={`${s.borderline} borderline`} />
              </div>
              {s.labelled && <Stat label={`Against your labels (n ${s.labelled.n})`} value={pct(s.labelled.accuracy)} hint={`precision ${pct(s.labelled.precision)} · recall ${pct(s.labelled.recall)} · FPR ${pct(s.labelled.false_positive_rate)}`} />}
              <div className="flex flex-wrap gap-1.5">{Object.entries(s.categories).map(([k, v]) => <Chip key={k} tone="accent">{CATEGORY_LABEL[k]} {v}</Chip>)}</div>
              <div className="text-xs text-ink-3">Median {s.median_ms.toFixed(1)} ms per message on this device.</div>
              <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={redactExport} onChange={(e) => setRedactExport(e.target.checked)} />Redact identifiers in export</label>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => download("tekme-batch.csv", toCsv(results, redactExport ? settings.redact : null))}><Download className="h-4 w-4" aria-hidden />CSV</Button>
                <Button variant="outline" onClick={() => download("tekme-batch-summary.json", JSON.stringify({ format: "tekme-batch/1", generated_at: new Date().toISOString(), redacted: redactExport, summary: s }, null, 1), "application/json")}>Summary JSON</Button>
              </div>
            </div>
          )}
        </Panel>
      </div>
      {results.length > 0 && (
        <Panel className="mt-5" title="Results" action={
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-1.5 text-ink-2">Show <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="rounded-md border border-line-2 bg-bg-2 px-2 py-1 text-ink"><option value="all">all</option><option value="SCAM">scam</option><option value="SAFE">safe</option><option value="borderline">borderline</option><option value="wrong">disagrees with label</option></select></label>
            <label className="flex items-center gap-1.5 text-ink-2">Sort <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="rounded-md border border-line-2 bg-bg-2 px-2 py-1 text-ink"><option value="id">row</option><option value="p">scam probability</option><option value="verdict">verdict</option></select></label>
          </div>}>
          <div className="max-h-[560px] overflow-auto scroll-thin">
            <table className="w-full min-w-[720px] text-left text-[0.84rem]">
              <thead className="sticky top-0 bg-surface"><tr className="border-b border-line text-ink-3"><th className="py-2 pr-2 font-medium">#</th><th className="py-2 pr-2 font-medium">Message</th><th className="py-2 pr-2 font-medium">Verdict</th><th className="py-2 pr-2 font-medium">Category</th><th className="py-2 pr-2 text-right font-medium">P(scam)</th><th className="py-2 font-medium">Label</th></tr></thead>
              <tbody>{shown.slice(0, 1000).map((r) => (
                <tr key={r.id} className="border-b border-line align-top last:border-0">
                  <td className="py-2 pr-2 tabular-nums text-ink-3">{r.id}</td>
                  <td className="max-w-[460px] py-2 pr-2 text-ink"><a className="hover:underline" href={`#/analyze?text=${encodeURIComponent(r.text)}`}>{r.text.length > 160 ? r.text.slice(0, 158) + "…" : r.text}</a></td>
                  <td className="py-2 pr-2"><Chip tone={r.verdict === "SCAM" ? "scam" : "safe"}>{r.verdict}</Chip>{r.borderline && <Chip tone="uncertain" className="ml-1">borderline</Chip>}</td>
                  <td className="py-2 pr-2 text-ink-2">{r.category ? CATEGORY_LABEL[r.category] : "—"}</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-ink">{confPct(r.scam_probability)}</td>
                  <td className="py-2">{r.label ? <Chip tone={r.label === r.verdict ? "neutral" : "warn"}>{r.label}</Chip> : <span className="text-ink-3">—</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {shown.length > 1000 && <p className="mt-2 text-xs text-ink-3">Showing the first 1,000 rows; the export contains all {shown.length.toLocaleString()}.</p>}
        </Panel>
      )}
      <div className="mt-5"><Note>Processing runs in small chunks on the main thread so the page stays responsive. Labels you supply are only used to compute the summary shown here.</Note></div>
    </div>
  );
}
