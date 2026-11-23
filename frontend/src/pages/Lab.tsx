import { useEffect, useRef, useState } from "react";
import { FlaskConical, Gauge, Shuffle } from "lucide-react";
import { useApp } from "../app/context";
import { PageHeader } from "../components/Shell";
import { EXAMPLES } from "../components/AnalyzerWidget";
import { BarList } from "../components/charts";
import { Button, Chip, Note, Panel, Stat, confPct, pct } from "../components/ui";
import { MUTATION_TYPES, TRAIN_AUGMENT_TYPES, generate } from "../analysis/mutations";
import { counterfactuals, type CounterfactualReport } from "../analysis/counterfactual";
import { MarkLoader } from "../brand/EvidenceMark";

interface VRes { type: string; description: string; text: string; changed: boolean; verdict: string; p: number; flipped: boolean }

export default function Lab({ params }: { params: URLSearchParams }) {
  const { engine, status, metrics } = useApp();
  const [text, setText] = useState(params.get("text") ?? EXAMPLES.find((e) => e.id === "kyc_en")?.text ?? "");
  const [expected, setExpected] = useState<"SCAM" | "SAFE" | "">((params.get("expected") as "SCAM" | "SAFE") ?? "");
  const [types, setTypes] = useState<string[]>(Object.keys(MUTATION_TYPES));
  const [perType, setPerType] = useState(1);
  const [res, setRes] = useState<{ base: { verdict: string; p: number }; variants: VRes[] } | null>(null);
  const [cf, setCf] = useState<CounterfactualReport | null>(null);
  const once = useRef(false);

  const runAll = () => {
    if (!engine || !text.trim()) return;
    const base = engine.predictLight(text, false);
    const variants = generate(text, types, perType, 0).map((v) => {
      const p = engine.predictLight(v.text, false);
      return { ...v, verdict: p.verdict, p: p.scam_probability, flipped: p.verdict !== base.verdict };
    });
    setRes({ base: { verdict: base.verdict, p: base.scam_probability }, variants });
    setCf(counterfactuals(engine, text));
  };
  useEffect(() => { if (engine && !once.current && (params.get("run") || true)) { once.current = true; runAll(); } }); // eslint-disable-line react-hooks/exhaustive-deps

  const flips = res?.variants.filter((v) => v.flipped).length ?? 0;
  const acc = res && expected ? res.variants.filter((v) => v.verdict === expected).length / res.variants.length : null;
  const adv = metrics?.adversarial as Record<string, { held_out: boolean; n: number; accuracy: number; scam_recall: number; safe_specificity: number; verdict_flip_rate: number }> | undefined;

  return (
    <div>
      <PageHeader eyebrow="Adversarial laboratory" title="Try to fool the model">
        Disguise a message the way scammers do and see whether the verdict holds, then remove pieces of evidence to see what the model is sensitive to. Everything runs on this device.
      </PageHeader>
      {status === "loading" && <MarkLoader label="Loading model…" />}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Panel as="div">
          <label htmlFor="lab-text" className="text-sm font-semibold text-ink">Message</label>
          <textarea id="lab-text" rows={4} value={text} onChange={(e) => setText(e.target.value)} className="mt-1 w-full rounded-xl border border-line-2 bg-bg-2 p-3.5 text-ink outline-none focus:border-accent" />
          <fieldset className="mt-3">
            <legend className="text-sm font-semibold text-ink">Mutation types</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(MUTATION_TYPES).map(([k, d]) => (
                <label key={k} title={d} className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${types.includes(k) ? "border-accent bg-accent-soft text-ink" : "border-line-2 text-ink-2"}`}>
                  <input type="checkbox" className="sr-only" checked={types.includes(k)} onChange={() => setTypes((t) => (t.includes(k) ? t.filter((x) => x !== k) : [...t, k]))} />
                  {k.replace(/_/g, " ")}{!TRAIN_AUGMENT_TYPES.includes(k) && <span className="text-ink-3">· held out</span>}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2 text-ink-2">Variants per type
              <select value={perType} onChange={(e) => setPerType(+e.target.value)} className="rounded-md border border-line-2 bg-bg-2 px-2 py-1 text-ink">{[1, 2, 3].map((n) => <option key={n}>{n}</option>)}</select></label>
            <label className="flex items-center gap-2 text-ink-2">Known label
              <select value={expected} onChange={(e) => setExpected(e.target.value as "SCAM" | "SAFE" | "")} className="rounded-md border border-line-2 bg-bg-2 px-2 py-1 text-ink"><option value="">unknown</option><option>SCAM</option><option>SAFE</option></select></label>
            <Button variant="analyze" className="ml-auto" onClick={runAll} disabled={!engine || !types.length}>Run stress test</Button>
          </div>
        </Panel>
        <Panel title="Result" icon={<Gauge className="h-5 w-5" />}>
          {!res ? <p className="text-sm text-ink-3">Run a test.</p> : (
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Original" value={res.base.verdict} hint={`P(scam) ${confPct(res.base.p)}`} tone={res.base.verdict === "SCAM" ? "scam" : "safe"} />
              <Stat label="Consistency" value={pct(1 - flips / res.variants.length, 0)} hint={`${flips} of ${res.variants.length} variants flipped`} />
              {acc !== null && <Stat label="Accuracy vs label" value={pct(acc, 0)} hint={`expected ${expected}`} />}
            </div>
          )}
          <p className="mt-3 text-xs text-ink-3">Consistency only says the verdict did not change; it is not accuracy unless you give the true label.</p>
        </Panel>
      </div>
      {res && (
        <Panel title="Variants" icon={<FlaskConical className="h-5 w-5" />} className="mt-5">
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full min-w-[720px] text-left text-[0.85rem]">
              <thead><tr className="border-b border-line text-ink-3"><th className="py-2 pr-3 font-medium">Type</th><th className="py-2 pr-3 font-medium">Variant</th><th className="py-2 pr-3 font-medium">Verdict</th><th className="py-2 text-right font-medium">P(scam)</th></tr></thead>
              <tbody>{res.variants.map((v, i) => (
                <tr key={i} className="border-b border-line align-top last:border-0">
                  <td className="py-2 pr-3 text-ink-2">{v.type.replace(/_/g, " ")}</td>
                  <td className="max-w-[520px] break-words py-2 pr-3 font-mono text-[0.78rem] text-ink">{v.text}</td>
                  <td className="py-2 pr-3"><Chip tone={v.verdict === "SCAM" ? "scam" : "safe"}>{v.verdict}</Chip>{v.flipped && <Chip tone="warn" className="ml-1">flipped</Chip>}</td>
                  <td className="py-2 text-right tabular-nums text-ink">{confPct(v.p)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-ink-3">The browser uses its own seeded random generator, so variants differ character-by-character from the Python Mutation Lab while following the same rules.</p>
        </Panel>
      )}
      {cf && (
        <Panel title="Counterfactual sensitivity" icon={<Shuffle className="h-5 w-5" />} className="mt-5">
          {!cf.edits.length ? <p className="text-sm text-ink-3">No removable evidence (no links, tactics, brands or contact details) was found.</p> : (
            <>
              <ul className="space-y-2">
                {cf.edits.map((e) => (
                  <li key={e.id} className="grid gap-2 rounded-xl border border-line bg-bg-2 p-3 text-[0.86rem] md:grid-cols-[1fr_auto]">
                    <div><b className="text-ink">{e.label}</b> <span className="text-ink-3">— removed {e.removed.map((r) => `“${r}”`).join(", ")}</span></div>
                    <div className="flex items-center gap-2 tabular-nums">
                      <span className="text-ink-2">{confPct(e.before)} → <b className="text-ink">{confPct(e.after)}</b></span>
                      <Chip tone={e.delta < -0.05 ? "safe" : e.delta > 0.05 ? "scam" : "neutral"}>{e.delta >= 0 ? "+" : ""}{(e.delta * 100).toFixed(1)} pts</Chip>
                      {e.flips && <Chip tone="warn">verdict flips</Chip>}
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm text-ink">{cf.minimal_flip ? <>Removing <b>{cf.minimal_flip.labels.join(" + ")}</b> changes the verdict (P(scam) → {confPct(cf.minimal_flip.after)}).</> : "No combination of up to five removals changes the verdict — the decision rests on more than one kind of evidence."}</p>
            </>
          )}
          <div className="mt-3"><Note>{cf.note}</Note></div>
        </Panel>
      )}
      {adv && (
        <Panel title="Robustness dashboard (measured)" icon={<Gauge className="h-5 w-5" />} className="mt-5">
          <p className="mb-3 text-sm text-ink-2">From <code>reports/metrics.json</code>: 1,000 test messages per mutation type, generated by the Python Mutation Lab from the untouched test split. “Held out” types were never used for training augmentation.</p>
          <BarList ariaLabel="Accuracy and verdict-flip rate per mutation type" format={(v) => pct(v, 1)} labelW={200}
            data={Object.entries(adv).map(([k, v]) => ({ label: `${k.replace(/_/g, " ")}${v.held_out ? " (held out)" : ""}`, value: v.accuracy, note: `scam recall ${pct(v.scam_recall)} · safe specificity ${pct(v.safe_specificity)} · flip rate ${pct(v.verdict_flip_rate)}` }))} />
        </Panel>
      )}
    </div>
  );
}
