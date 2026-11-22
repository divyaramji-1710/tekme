import { useEffect, useState } from "react";
import { Activity, Gauge, Layers, Shuffle, Tags } from "lucide-react";
import { api, ApiError, CATEGORY_LABELS, LANGUAGE_LABELS, type Category, type Metrics } from "../services/api";
import { Card, ErrorBox, Spinner, Stat, pct } from "../components/ui";
import { BarList, ReliabilityChart } from "../components/charts";

const SUBSET_LABELS: Record<string, string> = {
  genuine_otp: "Genuine OTP messages", genuine_bank_notifications: "Genuine bank notifications", genuine_delivery_notifications: "Genuine delivery updates",
  genuine_with_links: "Genuine messages with links", genuine_personal_chat: "Genuine personal chat",
  scam_kyc_bank: "KYC / Bank scams", scam_loan_credit: "Loan / Credit scams", scam_lottery_prize: "Lottery / Prize scams",
  scam_job_investment: "Job / Investment scams", scam_other: "Other scams", borderline_test_b_hard: "Borderline (Test B 'hard')",
};

export default function Diagnostics() {
  const [m, setM] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => { setError(null); api.metrics().then(setM).catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load metrics")); };
  useEffect(load, []);
  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!m) return <Card><div className="py-16 text-center"><Spinner label="Loading saved evaluation results…" /></div></Card>;

  const t = m.test, tb = m.test_b;
  const cm = t.confusion_matrix;
  const ablation = Object.entries(m.ablation as Record<string, Metrics>);
  const rob = Object.entries(m.adversarial as Record<string, Metrics>).filter(([k]) => k !== "unmutated_baseline");
  const perf = m.performance;

  return (
    <div className="space-y-6">
      <p className="text-sm text-ink-3">All figures are read from <code className="text-ink-2">reports/metrics.json</code>, produced by <code className="text-ink-2">ml/evaluation/evaluate.py</code> on {m.generated_at} from the shipped model bundle. Test data was never used for training, tuning or calibration.</p>

      <Card title="Untouched test set" icon={<Gauge className="h-4 w-4" />} action={<span className="text-xs text-ink-3">{t.n.toLocaleString()} messages · {t.n_scam} scam / {t.n_safe} safe</span>}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Accuracy" value={pct(t.accuracy)} />
          <Stat label="F1 (scam)" value={pct(t.f1)} hint={`macro-F1 ${pct(t.macro_f1)}`} />
          <Stat label="Precision" value={pct(t.precision)} />
          <Stat label="Recall" value={pct(t.recall)} hint={`false-negative rate ${pct(t.false_negative_rate)}`} />
          <Stat label="False-positive rate" value={pct(t.false_positive_rate)} hint={`${cm.fp} genuine messages flagged`} tone={t.false_positive_rate > 0.05 ? "scam" : undefined} />
          <Stat label="ROC-AUC" value={t.roc_auc.toFixed(4)} />
          <Stat label="Brier score" value={t.brier.toFixed(4)} hint="lower is better" />
          <Stat label="Calibration error (ECE)" value={t.ece_scam_prob.toFixed(4)} hint="10 equal-width bins" />
        </div>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="mb-3 text-sm font-medium text-ink-2">Confusion matrix</h3>
            <table className="w-full max-w-sm text-center text-sm">
              <thead><tr className="text-xs text-ink-3"><th /><th className="py-1 font-medium">Predicted SAFE</th><th className="py-1 font-medium">Predicted SCAM</th></tr></thead>
              <tbody>
                <tr><th className="py-1 pr-2 text-right text-xs font-medium text-ink-3">True SAFE</th><td className="rounded-l-lg bg-safe-bg py-4 text-lg font-semibold text-safe">{cm.tn}</td><td className="bg-surface-2 py-4 text-lg font-semibold text-ink-2">{cm.fp}</td></tr>
                <tr><th className="py-1 pr-2 text-right text-xs font-medium text-ink-3">True SCAM</th><td className="bg-surface-2 py-4 text-lg font-semibold text-ink-2">{cm.fn}</td><td className="rounded-r-lg bg-scam-bg py-4 text-lg font-semibold text-scam">{cm.tp}</td></tr>
              </tbody>
            </table>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium text-ink-2">Reliability of confidence</h3>
            <ReliabilityChart bins={t.reliability} />
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Ablation — does each engine help?" icon={<Layers className="h-4 w-4" />}>
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-3">F1 on test</h3>
          <BarList ariaLabel="Ablation F1 on test" max={1} data={ablation.map(([k, v]) => ({ label: k.replace(/_/g, " "), value: v.test.f1 }))}
            detail={(d) => { const v = (m.ablation as Metrics)[d.label.replace(/ /g, "_")]; return [d.label, `F1 ${v.test.f1}`, `FPR ${v.test.false_positive_rate}`, `Test B F1 ${v.test_b.f1}`, `Adversarial F1 ${v.adversarial_sample.f1}`]; }} />
          <h3 className="mb-1 mt-4 text-xs font-medium uppercase tracking-wide text-ink-3">False-positive rate on test (lower is better)</h3>
          <BarList ariaLabel="Ablation false-positive rate on test" max={Math.max(0.05, ...ablation.map(([, v]) => v.test.false_positive_rate)) * 1.2} format={(v) => (v * 100).toFixed(1) + "%"}
            data={ablation.map(([k, v]) => ({ label: k.replace(/_/g, " "), value: v.test.false_positive_rate }))} />
          <table className="mt-4 w-full text-xs"><thead><tr className="text-left text-ink-3"><th className="py-1 font-medium">Variant</th><th className="font-medium">Test B F1</th><th className="font-medium">Test B FPR</th><th className="font-medium">Adversarial F1</th></tr></thead>
            <tbody>{ablation.map(([k, v]) => <tr key={k} className="border-t border-line/60 text-ink-2"><td className="py-1.5">{k.replace(/_/g, " ")}</td><td className="tabular-nums">{v.test_b.f1.toFixed(4)}</td><td className="tabular-nums">{pct(v.test_b.false_positive_rate)}</td><td className="tabular-nums">{v.adversarial_sample.f1.toFixed(4)}</td></tr>)}</tbody></table>
        </Card>
        <Card title="Robustness to disguised wording" icon={<Shuffle className="h-4 w-4" />}>
          <p className="mb-3 text-xs text-ink-3">Accuracy on mutated test messages with known labels (* = mutation type never used in training augmentation). Unmutated baseline: scam recall {pct(m.adversarial.unmutated_baseline.scam_recall)}, safe specificity {pct(m.adversarial.unmutated_baseline.safe_specificity)}.</p>
          <BarList ariaLabel="Accuracy by mutation type" max={1} data={rob.map(([k, v]) => ({ label: `${k.replace(/_/g, " ")}${v.held_out ? " *" : ""}`, value: v.accuracy }))}
            detail={(d) => { const v = rob.find(([k]) => d.label.startsWith(k.replace(/_/g, " ")))![1]; return [d.label, `accuracy ${pct(v.accuracy)}`, `scam recall ${pct(v.scam_recall)}`, `safe specificity ${pct(v.safe_specificity)}`, `verdict flips ${pct(v.verdict_flip_rate)}`]; }} />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Special subsets" icon={<Activity className="h-4 w-4" />}>
          <table className="w-full text-sm"><thead><tr className="text-left text-xs uppercase tracking-wide text-ink-3"><th className="py-1 font-medium">Subset</th><th className="font-medium">n</th><th className="text-right font-medium">Correct</th></tr></thead>
            <tbody>{Object.entries(m.subsets as Record<string, Metrics>).filter(([k, v]) => SUBSET_LABELS[k] && v.n).map(([k, v]) => (
              <tr key={k} className="border-t border-line/60"><td className="py-1.5 text-ink-2">{SUBSET_LABELS[k]}</td><td className="tabular-nums text-ink-3">{v.n}</td><td className="text-right tabular-nums text-ink">{pct(v.accuracy)}</td></tr>))}</tbody></table>
          <h3 className="mb-2 mt-5 text-xs font-medium uppercase tracking-wide text-ink-3">By language (test)</h3>
          <table className="w-full text-sm"><thead><tr className="text-left text-xs text-ink-3"><th className="py-1 font-medium">Language</th><th className="font-medium">n</th><th className="font-medium">Accuracy</th><th className="font-medium">Recall</th><th className="font-medium">FPR</th></tr></thead>
            <tbody>{Object.entries(m.test_by_language as Record<string, Metrics>).map(([k, v]) => (
              <tr key={k} className="border-t border-line/60 text-ink-2"><td className="py-1.5">{LANGUAGE_LABELS[k] ?? k}</td><td className="tabular-nums text-ink-3">{v.n}</td><td className="tabular-nums">{pct(v.accuracy)}</td><td className="tabular-nums">{pct(v.recall)}</td><td className="tabular-nums">{pct(v.false_positive_rate)}</td></tr>))}</tbody></table>
          <p className="mt-2 text-xs text-ink-3">Hinglish, Hindi and regional rows come from a small synthetic dataset; treat these numbers as indicative.</p>
        </Card>
        <Card title="Scam categories" icon={<Tags className="h-4 w-4" />} action={<span className="text-xs text-ink-3">macro-F1 {pct(m.category.macro_f1)}</span>}>
          <table className="w-full text-sm"><thead><tr className="text-left text-xs uppercase tracking-wide text-ink-3"><th className="py-1 font-medium">Category</th><th className="font-medium">Precision</th><th className="font-medium">Recall</th><th className="font-medium">F1</th><th className="text-right font-medium">n</th></tr></thead>
            <tbody>{Object.entries(m.category.per_class as Record<string, Metrics>).map(([k, v]) => (
              <tr key={k} className="border-t border-line/60 text-ink-2"><td className="py-1.5">{CATEGORY_LABELS[k as Category]}</td><td className="tabular-nums">{pct(v.precision)}</td><td className="tabular-nums">{pct(v.recall)}</td><td className="tabular-nums">{pct(v["f1-score"])}</td><td className="text-right tabular-nums text-ink-3">{v.support}</td></tr>))}</tbody></table>
          <p className="mt-2 text-xs text-ink-3">{m.category.note} SAFE predictions carrying a category: {m.category.safe_predictions_with_category}.</p>
          <h3 className="mb-2 mt-5 text-xs font-medium uppercase tracking-wide text-ink-3">External Test B ({tb.n} unseen, mostly non-Indian messages)</h3>
          <div className="grid grid-cols-3 gap-3"><Stat label="Accuracy" value={pct(tb.accuracy)} /><Stat label="F1" value={pct(tb.f1)} /><Stat label="FPR" value={pct(tb.false_positive_rate)} /></div>
        </Card>
      </div>

      <Card title="Efficiency on this laptop (CPU only)" icon={<Gauge className="h-4 w-4" />}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Single message p50" value={`${perf.single_predict_ms.p50.toFixed(1)} ms`} hint={`p95 ${perf.single_predict_ms.p95.toFixed(1)} ms`} />
          <Stat label="Batch throughput" value={`${perf.batch_ms_per_message.toFixed(2)} ms`} hint="per message" />
          <Stat label="Model load" value={`${perf.model_load_seconds.toFixed(2)} s`} />
          <Stat label="Bundle size" value={`${perf.bundle_size_mb} MB`} />
          <Stat label="RAM after load" value={`+${perf.rss_increase_after_load_mb} MB`} hint={`process ${perf.process_rss_mb} MB`} />
        </div>
        <p className="mt-3 text-xs text-ink-3">Measured on {perf.cpu}. Latency includes preprocessing, all engines, fusion, categorisation and explanation.</p>
      </Card>
    </div>
  );
}
