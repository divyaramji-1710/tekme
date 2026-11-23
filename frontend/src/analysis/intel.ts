// Unfamiliar-message detection and scam-family lookup, using artefacts fitted by ml/analysis/build_intel.py
// on the training split (thresholds from validation).
import type { Engine } from "../engine/engine";
import { wordTokens } from "../engine/textmodel";

export interface Family {
  cluster: number; size: number; scam_share: number; is_scam_family: boolean; top_terms: string[]; dominant_category: string | null;
  category_counts: Record<string, number>; tactic_share: Record<string, number>; sources: Record<string, number>;
  synthetic_share: number; examples: { text: string; synthetic: boolean }[];
}
export interface MeasuredSet { set: string; n: number; flagged: number; flagged_share: number; accuracy_flagged: number | null; accuracy_not_flagged: number | null; mean_confidence_flagged: number | null; mean_confidence_not_flagged: number | null }
export interface Intel {
  format: string; fitted_on: string; k: number;
  centroids: { cols: number[]; vals: number[] }[];
  unfamiliar: { similarity_threshold: number; coverage_threshold: number; rule: string; measured: MeasuredSet[] };
  families: Family[];
  source_comparison: { note: string; rows: { source: string; label: string; published: number; kind: string; n_scam_messages: number; tactic_share: Record<string, number>; link_share: number }[] };
}
export interface Familiarity { similarity: number; coverage: number; unfamiliar: boolean; reasons: string[]; nearest: Family | null; nearest_similarity: number }

export async function loadIntel(base = "/model/"): Promise<Intel> {
  const r = await fetch(base + "intel.json");
  if (!r.ok) throw new Error("intel.json missing");
  return (await r.json()) as Intel;
}

export function familiarity(engine: Engine, intel: Intel, modelText: string): Familiarity {
  const x = engine.semantic.vector(modelText);
  const norm = Math.sqrt(x.reduce((s, [, v]) => s + v * v, 0)) || 1;
  const xm = new Map(x.map(([j, v]) => [j, v / norm]));
  let best = -1, bestK = -1;
  intel.centroids.forEach((c, k) => {
    let s = 0;
    for (let i = 0; i < c.cols.length; i++) { const v = xm.get(c.cols[i]); if (v !== undefined) s += v * c.vals[i]; }
    if (s > best) { best = s; bestK = k; }
  });
  const toks = wordTokens(modelText.toLowerCase());
  const coverage = toks.length ? toks.filter((w) => engine.semantic.inVocab(0, w)).length / toks.length : 0;
  const u = intel.unfamiliar;
  const reasons: string[] = [];
  if (best < u.similarity_threshold) reasons.push("its wording is far from every group of training messages");
  if (coverage < u.coverage_threshold) reasons.push("many of its words never appeared in the training data");
  return { similarity: best, coverage, unfamiliar: reasons.length > 0, reasons, nearest: intel.families.find((f) => f.cluster === bestK) ?? null, nearest_similarity: best };
}
