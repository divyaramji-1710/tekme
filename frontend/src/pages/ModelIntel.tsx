import { useState } from "react";
import { Activity, Boxes, Cpu, GitCompare, Languages, Radar, Scale, Swords, Target, Timer } from "lucide-react";
import { useApp, type Json } from "../app/context";
import { PageHeader } from "../components/Shell";
import { BarList, HeatTable, ReliabilityChart, type RelBin } from "../components/charts";
import { Button, Chip, Note, Panel, Stat, confPct, num, pct } from "../components/ui";
import { CATEGORY_LABEL } from "../components/result";
import { EXAMPLES } from "../components/AnalyzerWidget";
import { TACTIC_META } from "../engine/tactics";

const ARENA_LABEL: Record<string, string> = {
  A_semantic_only: "A · Text model only", "B_semantic+tactics": "B · Text + Scam DNA", "C_semantic+trust": "C · Text + link/trust signals",
  "D_semantic+benign": "D · Text + genuine-message protection", E_full_hybrid: "E · Full hybrid (deployed)",
};

function Arena() {
  const { engine, metrics } = useApp();
  const [text, setText] = useState(EXAMPLES.find((e) => e.id === "otp_scam")?.text ?? EXAMPLES[0].text);
  const [rows, setRows] = useState<{ k: string; p: number }[] | null>(null);
  const run = () => {
    if (!engine) return;
    const l = engine.predictLight(text, false);
    setRows(Object.entries(engine.ablations).map(([k, f]) => ({ k, p: f.proba(l.row) })));
  };
  const abl = metrics?.ablation as Record<string, { test: Json; test_b: Json }> | undefined;
  return (
    <Panel title="Model Battle Arena" icon={<Swords className="h-5 w-5" />}>
      <p className="mb-3 text-sm text-ink-2">Five calibrated fusion models trained on the same data with different evidence groups. Type a message to see each model's live prediction on this device; the table shows each model's measured results on the same held-out sets.</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="arena" className="sr-only">Message for the arena</label>
        <input id="arena" value={text} onChange={(e) => setText(e.target.value)} className="flex-1 rounded-lg border border-line-2 bg-bg-2 px-3 py-2 text-ink" />
        <Button variant="analyze" onClick={run} disabled={!engine}>Compare</Button>
      </div>
      <div className="mt-4 overflow-x-auto scroll-thin">
        <table className="w-full min-w-[720px] text-left text-[0.85rem]">
          <thead><tr className="border-b border-line text-ink-3"><th className="py-2 font-medium">Model</th><th className="py-2 font-medium">This message</th><th className="py-2 text-right font-medium">Test F1</th><th className="py-2 text-right font-medium">Test FPR</th><th className="py-2 text-right font-medium">Test B F1</th><th className="py-2 text-right font-medium">Test B FPR</th></tr></thead>
          <tbody>{Object.keys(ARENA_LABEL).map((k) => {
            const r = rows?.find((x) => x.k === k);
            const m = abl?.[k];
            return (
              <tr key={k} className={`border-b border-line last:border-0 ${k === "E_full_hybrid" ? "font-semibold" : ""}`}>
                <td className="py-2 pr-3 text-ink">{ARENA_LABEL[k]}</td>
                <td className="py-2 pr-3">{r ? <><Chip tone={r.p >= 0.5 ? "scam" : "safe"}>{r.p >= 0.5 ? "SCAM" : "SAFE"}</Chip> <span className="tabular-nums text-ink-2">P(scam) {confPct(r.p)}</span></> : <span className="text-ink-3">—</span>}</td>
                <td className="py-2 text-right tabular-nums text-ink">{num(m?.test?.f1)}</td><td className="py-2 text-right tabular-nums text-ink">{pct(m?.test?.false_positive_rate)}</td>
                <td className="py-2 text-right tabular-nums text-ink">{num(m?.test_b?.f1)}</td><td className="py-2 text-right tabular-nums text-ink">{pct(m?.test_b?.false_positive_rate)}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-ink-3">Honest result: the full hybrid lowers the false-positive rate on the test split at equal F1, but variant B scores higher F1 on the harder external Test B.</p>
    </Panel>
  );
}

function Benchmark() {
  const { engine } = useApp();
  const [r, setR] = useState<{ med: number; p95: number; n: number } | null>(null);
  const run = () => {
    if (!engine) return;
    const msgs = EXAMPLES.map((e) => e.text);
    const t: number[] = [];
    for (let i = 0; i < 60; i++) { const s = performance.now(); engine.predict(msgs[i % msgs.length]); t.push(performance.now() - s); }
    t.sort((a, b) => a - b);
    setR({ med: t[Math.floor(t.length / 2)], p95: t[Math.floor(t.length * 0.95) - 1], n: t.length });
  };
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Model load (this browser)" value={engine ? `${Math.round(engine.loadMs)} ms` : "—"} hint="fetch + integrity check + index" />
        <Stat label="Model download" value={engine ? `${(engine.manifest.model_bin_bytes / 1e6).toFixed(1)} MB` : "—"} hint="cached for offline use" />
        <Stat label="Median latency here" value={r ? `${r.med.toFixed(1)} ms` : "—"} hint={r ? `p95 ${r.p95.toFixed(1)} ms · ${r.n} runs` : "run the benchmark"} />
        <Stat label="JS heap" value={mem ? `${Math.round(mem.usedJSHeapSize / 1e6)} MB` : "n/a"} hint={mem ? "Chromium only" : "not exposed by this browser"} />
      </div>
      <Button variant="outline" className="mt-3" onClick={run} disabled={!engine}><Timer className="h-4 w-4" aria-hidden />Run 60-message benchmark on this device</Button>
    </div>
  );
}

export default function ModelIntel() {
  const { metrics, intel, parity } = useApp();
  const t = metrics?.test as Json | undefined;
  const tb = metrics?.test_b as Json | undefined;
  const adv = metrics?.adversarial_overall as Json | undefined;
  const perf = metrics?.performance as Json | undefined;
  const c = t?.confusion_matrix as { tn: number; fp: number; fn: number; tp: number } | undefined;
  const cm = c ? [[c.tn, c.fp], [c.fn, c.tp]] : undefined;
  return (
    <div>
      <PageHeader eyebrow="Model intelligence" title="What the model can and cannot do">
        Every number on this page is read from files produced by the evaluation scripts (<code>reports/metrics.json</code>, <code>intel_report.json</code>, <code>parity_report.json</code>) or measured live in this browser. Nothing is typed in by hand.
      </PageHeader>
      {!metrics ? <Note tone="warn">The evaluation report could not be loaded (frontend/public/data/metrics.json). Run <code>python -m ml.export.export_web</code>.</Note> : (
        <div className="space-y-5">
          <Panel title="Held-out test results" icon={<Target className="h-5 w-5" />}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Accuracy" value={pct(t?.accuracy)} hint={`n = ${t?.n?.toLocaleString()}`} />
              <Stat label="Precision / recall" value={`${pct(t?.precision, 0)} / ${pct(t?.recall, 0)}`} hint={`F1 ${num(t?.f1)}`} />
              <Stat label="False-positive rate" value={pct(t?.false_positive_rate)} hint="genuine messages flagged" tone="safe" />
              <Stat label="ROC-AUC · Brier · ECE" value={num(t?.roc_auc)} hint={`Brier ${num(t?.brier)} · ECE ${num(t?.ece_scam_prob, 4)}`} />
              <Stat label="External Test B" value={pct(tb?.accuracy)} hint={`F1 ${num(tb?.f1)} · FPR ${pct(tb?.false_positive_rate)} · n ${tb?.n}`} />
              <Stat label="Test B hard subset" value={pct(metrics.test_b_by_difficulty?.hard?.accuracy)} hint={`n ${metrics.test_b_by_difficulty?.hard?.n}`} tone="scam" />
              <Stat label="Disguised messages" value={pct(adv?.accuracy)} hint={`${adv?.n?.toLocaleString()} mutated test messages`} />
              <Stat label="Genuine OTPs flagged" value={`${Math.round((metrics.subsets?.genuine_otp?.flagged_as_scam ?? 0) * (metrics.subsets?.genuine_otp?.n ?? 0))} / ${metrics.subsets?.genuine_otp?.n}`} hint="test split" tone="safe" />
            </div>
            {cm && (
              <div className="mt-5 grid items-start gap-6 md:grid-cols-[auto_1fr]">
                <table className="text-center text-sm" aria-label="Confusion matrix on the test split">
                  <thead><tr><th /><th className="px-3 py-1 text-xs font-medium text-ink-3">Pred SAFE</th><th className="px-3 py-1 text-xs font-medium text-ink-3">Pred SCAM</th></tr></thead>
                  <tbody>
                    <tr><th className="pr-3 text-right text-xs font-medium text-ink-3">True SAFE</th><td className="rounded bg-safe-bg px-5 py-3 font-semibold tabular-nums text-safe">{cm[0][0]}</td><td className="rounded bg-scam-bg px-5 py-3 font-semibold tabular-nums text-scam">{cm[0][1]}</td></tr>
                    <tr><th className="pr-3 text-right text-xs font-medium text-ink-3">True SCAM</th><td className="rounded bg-scam-bg px-5 py-3 font-semibold tabular-nums text-scam">{cm[1][0]}</td><td className="rounded bg-safe-bg px-5 py-3 font-semibold tabular-nums text-safe">{cm[1][1]}</td></tr>
                  </tbody>
                </table>
                <Note tone="warn">41% of rows are LLM-generated, and genuine service messages (OTP, bank, delivery) are almost all synthetic, so the real-world false-positive rate is not directly measured. Test B (external, harder) is the better indication of performance on new data.</Note>
              </div>
            )}
          </Panel>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Calibration" icon={<Scale className="h-5 w-5" />}>
              {t?.reliability && <ReliabilityChart bins={t.reliability as RelBin[]} />}
              <p className="mt-2 text-xs text-ink-3">Isotonic calibration fitted on validation. Many scores sit near 0 or 1; mid-range bins hold few messages (hover for counts).</p>
            </Panel>
            <Panel title="Categories" icon={<Boxes className="h-5 w-5" />}>
              <BarList ariaLabel="Per-category F1 on gold-labelled test scams" format={(v) => v.toFixed(2)} labelW={150}
                data={Object.entries(metrics.category?.per_class ?? {}).filter(([k]) => CATEGORY_LABEL[k]).map(([k, v]) => ({ label: CATEGORY_LABEL[k], value: (v as Json)["f1-score"], note: `precision ${num((v as Json).precision, 2)} · recall ${num((v as Json).recall, 2)} · n ${(v as Json).support}` }))} />
              <p className="mt-2 text-xs text-ink-3">Macro-F1 {num(metrics.category?.macro_f1)} on {metrics.category?.n_gold_scams} gold-labelled scams. Weak-rule labels are excluded.</p>
            </Panel>
          </div>

          <Arena />

          <Panel title="By language and message type" icon={<Languages className="h-5 w-5" />}>
            <BarList ariaLabel="Accuracy by subset" format={(v) => pct(v, 1)} labelW={220}
              data={Object.entries(metrics.subsets ?? {}).map(([k, v]) => ({ label: k.replace(/_/g, " "), value: (v as Json).accuracy, note: `n ${(v as Json).n}` }))} />
            <p className="mt-2 text-xs text-ink-3">Hindi and Hinglish subsets are small and synthetic; treat them as indicative only.</p>
          </Panel>

          {intel && (
            <>
              <Panel title="Unfamiliar-message detection" icon={<Radar className="h-5 w-5" />}>
                <p className="text-sm text-ink-2">{intel.unfamiliar.rule}. Thresholds: cluster similarity &lt; {intel.unfamiliar.similarity_threshold.toFixed(3)}, known-word coverage &lt; {(intel.unfamiliar.coverage_threshold * 100).toFixed(1)}%.</p>
                <div className="mt-3 overflow-x-auto scroll-thin">
                  <table className="w-full min-w-[560px] text-left text-[0.85rem]">
                    <thead><tr className="border-b border-line text-ink-3"><th className="py-2 font-medium">Set</th><th className="py-2 text-right font-medium">Flagged</th><th className="py-2 text-right font-medium">Accuracy (flagged)</th><th className="py-2 text-right font-medium">Accuracy (not flagged)</th></tr></thead>
                    <tbody>{intel.unfamiliar.measured.map((m) => <tr key={m.set} className="border-b border-line last:border-0"><td className="py-2 text-ink">{m.set.replace(/_/g, " ")} (n {m.n})</td><td className="py-2 text-right tabular-nums text-ink">{pct(m.flagged_share)}</td><td className="py-2 text-right tabular-nums text-ink">{pct(m.accuracy_flagged)}</td><td className="py-2 text-right tabular-nums text-ink">{pct(m.accuracy_not_flagged)}</td></tr>)}</tbody>
                  </table>
                </div>
                <div className="mt-3"><Note tone="uncertain">The flag does detect distribution shift (external Test B is flagged about twice as often as the test split) but it barely predicts errors. TEKMĒ therefore shows it as a caveat and only turns verdicts with confidence below 75% into “Uncertain”.</Note></div>
              </Panel>

              <Panel title="Scam families" icon={<Activity className="h-5 w-5" />}>
                <p className="mb-3 text-sm text-ink-2">{intel.k} clusters of training messages (TF-IDF, k-means). Clusters that are at least 80% scam with 30+ members are shown as families. Example texts are redacted.</p>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {intel.families.filter((f) => f.is_scam_family).sort((a, b) => b.size - a.size).map((f) => (
                    <div key={f.cluster} className="rounded-xl border border-line bg-bg-2 p-4 text-[0.84rem]">
                      <div className="flex items-center justify-between"><b className="text-ink">Family #{f.cluster}</b><span className="text-xs text-ink-3">{f.size} msgs · {pct(f.synthetic_share, 0)} synthetic</span></div>
                      <div className="mt-1 text-ink-2">{f.top_terms.slice(0, 6).join(" · ")}</div>
                      <div className="mt-2 flex flex-wrap gap-1">{f.dominant_category && <Chip tone="accent">{CATEGORY_LABEL[f.dominant_category]}</Chip>}{Object.keys(f.tactic_share).slice(0, 3).map((t) => <Chip key={t}>{TACTIC_META[t]?.label.split(" ")[0] ?? t}</Chip>)}</div>
                      <p className="mt-2 text-xs italic text-ink-3">“{f.examples[0]?.text.slice(0, 130)}{(f.examples[0]?.text.length ?? 0) > 130 ? "…" : ""}”</p>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel title="How tactics differ between data sources" icon={<GitCompare className="h-5 w-5" />}>
                <HeatTable caption="Share of scam messages showing each tactic, per data source"
                  rows={intel.source_comparison.rows.sort((a, b) => a.published - b.published).map((r) => ({ key: r.source, label: `${r.label} (${r.published}, ${r.kind}, n ${r.n_scam_messages})` }))}
                  cols={[...["urgency", "threat", "authority", "reward", "sensitive_info", "payment", "link", "job_investment"].map((k) => ({ key: k, label: TACTIC_META[k]?.label.split(" ")[0] ?? k })), { key: "_link", label: "Has link" }]}
                  value={(r, c) => { const row = intel.source_comparison.rows.find((x) => x.source === r)!; return c === "_link" ? row.link_share : row.tactic_share[c] ?? 0; }} />
                <div className="mt-3"><Note>{intel.source_comparison.note}</Note></div>
              </Panel>
            </>
          )}

          <Panel title="Performance" icon={<Cpu className="h-5 w-5" />}>
            <Benchmark />
            {perf && <p className="mt-4 text-sm text-ink-2">Python reference ({perf.cpu}): model load {perf.model_load_seconds}s, {perf.bundle_size_mb} MB bundle, median {perf.single_predict_ms?.p50} ms / p95 {perf.single_predict_ms?.p95} ms per message, +{perf.rss_increase_after_load_mb} MB RAM. Measured on mains power; on battery the same laptop was several times slower (KNOWN_ISSUES K14).</p>}
          </Panel>

          {parity && (
            <Panel title="Browser ⇄ Python parity" icon={<GitCompare className="h-5 w-5" />}>
              <p className="text-sm text-ink">On {parity.n_messages?.toLocaleString()} reference messages the in-browser engine matched the Python model on verdict {pct(parity.agreement?.verdict, 2)}, category {pct(parity.agreement?.category, 2)}, explanation {pct(parity.agreement?.explanation, 2)} and highlights {pct(parity.agreement?.highlights, 2)}. Largest probability difference: {Number(parity.max_abs_difference?.scam_probability ?? 0).toExponential(1)} (float32 weights).</p>
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}
