import { useEffect, useState } from "react";
import { ArrowRight, Dna, FlaskConical, Info, ShieldAlert, ShieldCheck } from "lucide-react";
import { api, ApiError, MAX_CHARS, type MutationEval, type MutationType, type Verdict } from "../services/api";
import { Badge, Button, Card, Empty, ErrorBox, Spinner, Stat, confPct, pct } from "../components/ui";

const DEFAULT_TEXT = "Update your KYC immediately or your account will be blocked today. Click http://kyc-verify.example/login";

export default function MutationLab({ seedText }: { seedText: string | null }) {
  const [text, setText] = useState(seedText ?? DEFAULT_TEXT);
  const [types, setTypes] = useState<MutationType[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [expected, setExpected] = useState<Verdict | "">("");
  const [variants, setVariants] = useState(1);
  const [res, setRes] = useState<MutationEval | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (seedText) { setText(seedText); setRes(null); } }, [seedText]);
  useEffect(() => {
    api.mutationTypes().then((r) => {
      const all = r.types.map((t) => t.id);
      setTypes(r.types); setSelected(all);
      // deep link #lab?text=...&expected=SCAM&run=1 (demos / screenshots); runs the real model
      const q = new URLSearchParams(window.location.hash.split("?")[1] ?? "");
      const qt = q.get("text");
      const qe = q.get("expected");
      if (qt) setText(qt);
      if (qe === "SCAM" || qe === "SAFE") setExpected(qe);
      if (q.get("run") === "1") void run(qt ?? text, all, qe === "SCAM" || qe === "SAFE" ? qe : null);
    }).catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(t = text, sel = selected, exp: Verdict | null = expected || null) {
    if (!t.trim() || !sel.length) return;
    setLoading(true); setError(null);
    try { setRes(await api.evaluateMutations(t, sel, exp, variants)); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Unexpected error"); }
    finally { setLoading(false); }
  }
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <div className="space-y-6">
      <Card title="Adversarial Mutation Lab" icon={<FlaskConical className="h-4 w-4" />}>
        <p className="mb-4 text-sm text-ink-2">Scammers disguise wording to slip past filters. Generate controlled variations of a message locally and check whether the verdict holds. Links are only reformatted, never invented.</p>
        <label htmlFor="lab" className="text-xs font-medium uppercase tracking-wide text-ink-3">Original message</label>
        <textarea id="lab" value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={MAX_CHARS}
          className="mt-1 w-full resize-y rounded-lg border border-line bg-navy/60 p-3 text-sm text-ink focus:border-accent focus:outline-none" />
        <fieldset className="mt-4">
          <legend className="text-xs font-medium uppercase tracking-wide text-ink-3">Mutation types</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {types.map((t) => (
              <label key={t.id} title={t.description}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${selected.includes(t.id) ? "border-accent/60 bg-accent/10 text-ink" : "border-line-2 text-ink-3 hover:text-ink-2"}`}>
                <input type="checkbox" className="accent-[#2dd4bf]" checked={selected.includes(t.id)} onChange={() => toggle(t.id)} />
                {t.id.replace(/_/g, " ")}{!t.used_in_training_augmentation && <span className="text-[10px] text-ink-3" title="Never used for training augmentation">held-out</span>}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <label className="text-sm text-ink-2">Ground truth (optional)
            <select value={expected} onChange={(e) => setExpected(e.target.value as Verdict | "")} className="ml-2 rounded-lg border border-line-2 bg-surface-2 px-2 py-1.5 text-sm text-ink">
              <option value="">Unknown — report consistency</option><option value="SCAM">SCAM</option><option value="SAFE">SAFE</option>
            </select>
          </label>
          <label className="text-sm text-ink-2">Variants per type
            <select value={variants} onChange={(e) => setVariants(Number(e.target.value))} className="ml-2 rounded-lg border border-line-2 bg-surface-2 px-2 py-1.5 text-sm text-ink">
              {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <div className="ml-auto"><Button onClick={() => run()} disabled={loading || !text.trim() || !selected.length}>{loading ? <Spinner label="Running" /> : <><Dna className="h-4 w-4" />Generate & analyse</>}</Button></div>
        </div>
      </Card>

      {error && <ErrorBox message={error} onRetry={() => run()} />}
      {!res && !loading && !error && <Card><Empty icon={<FlaskConical className="h-6 w-6" />} title="No mutations run yet">Choose mutation types and press “Generate & analyse”. Every variant is scored by the real local model.</Empty></Card>}

      {res && (
        <div className="space-y-6 fade-in">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat label="Original verdict" value={`${res.original.verdict}`} tone={res.original.verdict === "SCAM" ? "scam" : "safe"} hint={`confidence ${confPct(res.original.confidence)}`} />
            <Stat label="Prediction consistency" value={pct(res.summary.consistency)} hint={`${res.summary.verdict_flips} verdict flip(s) of ${res.summary.n_variants}`} />
            <Stat label={res.summary.accuracy_vs_expected !== null ? "Accuracy vs ground truth" : "Accuracy"} value={res.summary.accuracy_vs_expected !== null ? pct(res.summary.accuracy_vs_expected) : "n/a"} hint={res.summary.accuracy_vs_expected !== null ? `expected ${expected}` : "set a ground truth to measure"} />
            <Stat label="Scam-probability range" value={`${confPct(res.summary.min_scam_probability)} – ${confPct(res.summary.max_scam_probability)}`} hint="across variants" />
          </div>
          <p className="flex items-start gap-2 text-xs text-ink-3"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />{res.summary.metric_note}</p>
          <Card title={`Variants (${res.variants.length})`}>
            <div className="overflow-x-auto scroll-thin">
              <table className="w-full min-w-[640px] text-sm">
                <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-3">
                  <th className="py-2 pr-3 font-medium">Mutation</th><th className="py-2 pr-3 font-medium">Text</th><th className="py-2 pr-3 font-medium">Verdict</th><th className="py-2 pr-3 text-right font-medium">Confidence</th><th className="py-2 font-medium">Changed?</th></tr></thead>
                <tbody>
                  {res.variants.map((v, i) => (
                    <tr key={i} className="border-b border-line/60 align-top">
                      <td className="py-2.5 pr-3 text-ink-2">{v.type.replace(/_/g, " ")}</td>
                      <td className="max-w-md py-2.5 pr-3 font-mono text-xs leading-5 text-ink break-words">{v.text}{!v.changed && <span className="ml-1 text-ink-3">(no change)</span>}</td>
                      <td className="py-2.5 pr-3">{v.verdict === "SCAM" ? <Badge tone="scam"><ShieldAlert className="h-3 w-3" />SCAM</Badge> : <Badge tone="safe"><ShieldCheck className="h-3 w-3" />SAFE</Badge>}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-ink-2">{confPct(v.confidence)}</td>
                      <td className="py-2.5">{v.verdict_changed ? <Badge tone="warn"><ArrowRight className="h-3 w-3" />flipped</Badge> : <span className="text-xs text-ink-3">stable</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
