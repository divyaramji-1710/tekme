// Python ⇄ browser parity. Runs the on-device engine over the reference corpus written by
// `python -m ml.export.parity` and writes reports/parity_report.json with measured agreement.
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { Engine, runEngines } from "../src/engine/engine";
import { loadEngineFromDisk } from "./helpers";

const ROOT = resolve(__dirname, "..", "..");
const CORPUS = resolve(ROOT, "ml/artifacts/parity/corpus.jsonl");

const has = existsSync(CORPUS);
const u16 = (spans: { start: number; end: number }[]) => spans.map((s) => [s.start, s.end]);
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

describe.skipIf(!has)("python/browser parity", () => {
  it("reproduces the Python engine on the reference corpus", () => {
    const engine: Engine = loadEngineFromDisk();
    const lines = readFileSync(CORPUS, "utf-8").split("\n").filter(Boolean);
    const fields = ["normalized", "model_text", "language", "entities", "obfuscation", "features", "tactics", "signals", "benign",
      "verdict", "category", "explanation", "key_factors", "semantic_terms", "highlights"] as const;
    const mismatch: Record<string, number> = Object.fromEntries(fields.map((f) => [f, 0]));
    const examples: Record<string, unknown[]> = {};
    const diffs = { sem: 0, spec: 0, fusion: 0, prob: 0, catprob: 0 };
    const bySource: Record<string, { n: number; verdict: number; category: number }> = {};
    const note = (f: string, ex: unknown) => { mismatch[f]++; (examples[f] ??= []).length < 3 && examples[f].push(ex); };
    const t0 = performance.now();
    for (const line of lines) {
      const ref = JSON.parse(line);
      const out = runEngines(ref.text);
      const p = engine.predict(ref.text);
      const row = p._row;
      const src = (bySource[ref.source] ??= { n: 0, verdict: 0, category: 0 });
      src.n++;
      if (out.pre.normalized !== ref.normalized) note("normalized", { text: ref.text, py: ref.normalized, js: out.pre.normalized });
      if (out.pre.model_text !== ref.model_text) note("model_text", { text: ref.text, py: ref.model_text, js: out.pre.model_text });
      if (out.pre.language !== ref.language) note("language", { text: ref.text, py: ref.language, js: out.pre.language });
      const ents = Object.fromEntries((["urls", "emails", "phones", "upi_ids", "amounts", "codes"] as const).map((k) => [k, u16(out.pre[k])]));
      if (!eq(ents, ref.entities)) note("entities", { text: ref.text, py: ref.entities, js: ents });
      if (!eq({ ...out.pre.obfuscation }, ref.obfuscation)) note("obfuscation", { text: ref.text, py: ref.obfuscation, js: out.pre.obfuscation });
      const fd = Object.keys(ref.features).filter((k) => !["sem_logit", "spec_logit"].includes(k) && Math.abs((row[k] ?? 0) - ref.features[k]) > 1e-9);
      if (fd.length) note("features", { text: ref.text, keys: fd.map((k) => [k, ref.features[k], row[k]]) });
      diffs.sem = Math.max(diffs.sem, Math.abs(row.sem_logit - ref.sem_logit));
      if (row.spec_applicable) diffs.spec = Math.max(diffs.spec, Math.abs(row.spec_logit - ref.spec_logit_raw));
      diffs.fusion = Math.max(diffs.fusion, Math.abs(engine.fusion.logit(row) - ref.fusion_logit));
      diffs.prob = Math.max(diffs.prob, Math.abs(engine.fusion.proba(row) - ref.scam_probability));
      const tac = out.tacticHits.map((h) => ({ id: h.id, strength: h.strength, evidence: u16(h.evidence) }));
      if (!eq(tac, ref.tactics)) note("tactics", { text: ref.text, py: ref.tactics, js: tac });
      const sig = out.signals.map((s) => ({ id: s.id, evidence: u16(s.evidence) }));
      if (!eq(sig, ref.signals)) note("signals", { text: ref.text, py: ref.signals, js: sig });
      const ben = { templates: out.benign.templates, conflict_reasons: out.benign.conflict_reasons };
      if (!eq(ben, ref.benign)) note("benign", { text: ref.text, py: ref.benign, js: ben });
      if (p.verdict !== ref.verdict) note("verdict", { text: ref.text, py: [ref.verdict, ref.scam_probability], js: [p.verdict, p.scam_probability] });
      else src.verdict++;
      if (p.category !== ref.category) note("category", { text: ref.text, py: ref.category, js: p.category });
      else src.category++;
      if (ref.verdict === "SCAM" && p.verdict === "SCAM") {
        const cp = engine.categorize(p._out).probs;
        for (const [k, v] of Object.entries(ref.category_probabilities as Record<string, number>)) diffs.catprob = Math.max(diffs.catprob, Math.abs(cp[k] - v));
      }
      if (p.explanation !== ref.explanation) note("explanation", { text: ref.text, py: ref.explanation, js: p.explanation });
      const kf = p.key_factors.map((k) => [k.feature, k.contribution]);
      if (!eq(kf, ref.key_factors)) note("key_factors", { text: ref.text, py: ref.key_factors, js: kf });
      const st = p.semantic_terms.map((t) => [t.term, t.contribution]);
      if (!eq(st, ref.semantic_terms)) note("semantic_terms", { text: ref.text, py: ref.semantic_terms, js: st });
      const hl = p.highlights.map((h) => [h.start, h.end, h.kind, h.label]);
      if (!eq(hl, ref.highlights)) note("highlights", { text: ref.text, py: ref.highlights, js: hl });
    }
    const n = lines.length;
    const report = {
      generated_by: "frontend/tests/parity.test.ts", corpus: "ml/artifacts/parity/corpus.jsonl (built by python -m ml.export.parity)",
      n_messages: n, seconds: +((performance.now() - t0) / 1000).toFixed(1),
      agreement: Object.fromEntries(fields.map((f) => [f, +(1 - mismatch[f] / n).toFixed(6)])),
      mismatches: mismatch,
      max_abs_difference: { semantic_logit: diffs.sem, specialist_logit: diffs.spec, fusion_logit: diffs.fusion, scam_probability: diffs.prob, category_probability: diffs.catprob },
      by_source: bySource,
      precision_note: "Weights are stored as float32 in the browser model; the Python model uses float64.",
      examples,
    };
    mkdirSync(resolve(ROOT, "reports"), { recursive: true });
    writeFileSync(resolve(ROOT, "reports/parity_report.json"), JSON.stringify(report, null, 1));
    console.log(JSON.stringify({ n, mismatch, max_abs_difference: report.max_abs_difference }, null, 1));
    expect(mismatch.verdict / n).toBeLessThanOrEqual(0.001);
    expect(mismatch.category / n).toBeLessThanOrEqual(0.002);
    expect(diffs.prob).toBeLessThan(1e-3);
  }, 600_000);
});
