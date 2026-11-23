// On-device TEKMĒ engine: the browser port of backend/services/inference.py.
import { RULES } from "./rules";
import { preprocess } from "./preprocess";
import { detect, tacticFeatures } from "./tactics";
import { analyse as trustAnalyse } from "./trust";
import { analyse as benignAnalyse } from "./benign";
import { Fusion } from "./fusion";
import { explain } from "./explain";
import { LinearTextModel, decodeStrings, type Manifest } from "./textmodel";
import { pyRound } from "./py";
import type { Category, CorePrediction, EngineOutput, LightPrediction, Verdict } from "./types";

export function runEngines(text: string): EngineOutput {
  const pre = preprocess(text);
  const hits = detect(pre);
  const { signals, feats: tf, urlInfo } = trustAnalyse(pre);
  const { report, feats: bf } = benignAnalyse(pre, hits, tf);
  return { pre, tacticHits: hits, signals, urlInfo, benign: report, features: { ...tacticFeatures(hits), ...tf, ...bf } };
}

export function isTransactional(f: Record<string, number>): boolean {
  return !!(f.has_url || f.has_phone || f.has_money || f.otp_mention || f.pin_mention || f.brand_mentioned || f.has_upi || f.has_email || f.benign_template_count > 0);
}

export const categoryText = (modelText: string, tacticIds: string[]) =>
  modelText + " " + tacticIds.map((t) => `zztactic${t.replace(/_/g, "")}`).join(" ");

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

export class Engine {
  readonly semantic: LinearTextModel;
  readonly specialist: LinearTextModel;
  readonly category: LinearTextModel;
  readonly fusion: Fusion;
  readonly ablations: Record<string, Fusion>;
  readonly threshold: number;
  readonly borderline: [number, number];
  loadMs = 0;

  constructor(readonly manifest: Manifest, buf: ArrayBuffer) {
    const strings = decodeStrings(buf, manifest.strings);
    const index = new Map<string, number>();
    strings.forEach((s, i) => index.set(s, i));
    const mk = (k: "semantic" | "specialist" | "category") => new LinearTextModel(manifest.models[k], buf, strings.length, index, strings);
    this.semantic = mk("semantic");
    this.specialist = mk("specialist");
    this.category = mk("category");
    this.fusion = new Fusion(manifest.fusion);
    this.ablations = Object.fromEntries(Object.entries(manifest.ablations).map(([k, v]) => [k, new Fusion(v)]));
    this.threshold = manifest.threshold;
    this.borderline = manifest.borderline_band;
  }

  /** Load from the bundled, same-origin files (cached by the service worker for offline use). */
  static async load(base = "/model/"): Promise<Engine> {
    const t0 = now();
    const [mres, bres] = await Promise.all([fetch(base + "model.json"), fetch(base + "model.bin")]);
    if (!mres.ok || !bres.ok) throw new Error("The on-device model files could not be loaded.");
    const manifest = (await mres.json()) as Manifest;
    const buf = await bres.arrayBuffer();
    if (buf.byteLength !== manifest.model_bin_bytes) throw new Error("The on-device model file is incomplete.");
    if (typeof crypto !== "undefined" && crypto.subtle) {
      const digest = await crypto.subtle.digest("SHA-256", buf);
      const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
      if (hex !== manifest.model_bin_sha256) throw new Error("The on-device model file failed its integrity check.");
    }
    const e = new Engine(manifest, buf);
    e.loadMs = now() - t0;
    return e;
  }

  row(o: EngineOutput): Record<string, number> {
    const appl = isTransactional(o.features);
    const sem = this.semantic.logit(o.pre.model_text);
    const spec = appl ? this.specialist.logit(o.pre.model_text) : 0;
    return { ...o.features, sem_logit: sem, spec_logit: spec, spec_applicable: +appl };
  }

  categorize(o: EngineOutput): { category: Category; probs: Record<string, number> } {
    const x = this.category.vector(categoryText(o.pre.model_text, o.tacticHits.map((h) => h.id)));
    const z = this.category.decision(x);
    const m = Math.max(...z);
    const e = z.map((v) => Math.exp(v - m));
    const s = e.reduce((a, b) => a + b, 0);
    const classes = this.category.spec.classes!;
    const probs: Record<string, number> = {};
    classes.forEach((c, i) => { probs[c] = e[i] / s; });
    let best = classes[0];
    for (const c of classes) if (probs[c] > probs[best]) best = c;
    if (best !== "OTHER" && probs[best] < this.manifest.category_other_threshold) best = "OTHER";
    return { category: best as Category, probs };
  }

  predictLight(text: string, withCategory = true): LightPrediction & { out: EngineOutput; row: Record<string, number> } {
    const out = runEngines(text);
    const row = this.row(out);
    const p = this.fusion.proba(row);
    const verdict: Verdict = p >= this.threshold ? "SCAM" : "SAFE";
    const category = withCategory && verdict === "SCAM" ? this.categorize(out).category : null;
    return { verdict, scam_probability: p, confidence: verdict === "SCAM" ? p : 1 - p, category, borderline: this.borderline[0] <= p && p <= this.borderline[1], out, row };
  }

  /** Full prediction: identical fields to POST /predict of the Python backend. */
  predict(text: string): CorePrediction & { _row: Record<string, number>; _out: EngineOutput } {
    const t0 = now();
    const out = runEngines(text);
    const row = this.row(out);
    const pi = this.fusion.proba(row);
    const verdict: Verdict = pi >= this.threshold ? "SCAM" : "SAFE";
    const confidence = verdict === "SCAM" ? pi : 1 - pi;
    let category: Category | null = null;
    let catProbs: Record<string, number> | null = null;
    if (verdict === "SCAM") {
      const c = this.categorize(out);
      category = c.category;
      catProbs = Object.fromEntries(Object.entries(c.probs).map(([k, v]) => [k, pyRound(v, 4)]));
    }
    const base = {
      verdict, category, category_label: category ? RULES.category_labels[category] : null,
      confidence: pyRound(confidence, 4), scam_probability: pyRound(pi, 4),
      borderline: this.borderline[0] <= pi && pi <= this.borderline[1],
    };
    const words = this.semantic.wordContributions(out.pre.model_text);
    const ex = explain(base, out, this.fusion.contributions(row), words);
    return {
      ...base,
      language: out.pre.language,
      normalized_text: out.pre.normalized,
      tactics: out.tacticHits,
      risk_signals: out.signals,
      benign: out.benign,
      category_probabilities: catProbs,
      obfuscation: { ...out.pre.obfuscation },
      ...ex,
      latency_ms: pyRound(now() - t0, 2),
      _row: row, _out: out,
    };
  }
}
