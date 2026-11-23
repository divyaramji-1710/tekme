// scikit-learn TfidfVectorizer (word / char_wb) + linear model, reproduced from the exported weights.
import { cps, pyCollapseWs2, pyRound, pySplit } from "./py";

interface ArrRef { offset: number; length: number; dtype: string }
export interface PartSpec { name: string; analyzer: "word" | "char_wb"; ngram_range: [number, number]; sublinear_tf: boolean; n_features: number; idf: ArrRef }
export interface LinearSpec { name: string; parts: PartSpec[]; terms: ArrRef; coef: ArrRef; coef_shape: [number, number]; intercept: number[]; classes?: string[] }
export interface FusionSpec { groups: string[]; names: string[]; mean: number[]; scale: number[]; coef: number[]; intercept: number; calibrator: { method: string; x?: number[]; y?: number[]; a?: number; b?: number } | null }
export interface Manifest {
  format: string; source_bundle_sha256: string; model_bin_sha256: string; model_bin_bytes: number;
  model_version: string; trained_at: string; strings: { offset: number; bytes: number; count: number };
  models: Record<"semantic" | "specialist" | "category", LinearSpec>;
  fusion: FusionSpec; ablations: Record<string, FusionSpec>;
  category_other_threshold: number; threshold: number; borderline_band: [number, number];
}

const WORD_TOKEN = /[\p{L}\p{N}_]+/gu; // (?u)\b\w+\b == maximal runs of Python word characters

export function wordTokens(lowered: string): string[] {
  return lowered.match(WORD_TOKEN) ?? [];
}
function wordNgrams(tokens: string[], [lo, hi]: [number, number]): string[] {
  const out: string[] = [];
  let min = lo;
  if (lo === 1) { out.push(...tokens); min = 2; }
  for (let n = min; n <= Math.min(hi, tokens.length); n++)
    for (let i = 0; i + n <= tokens.length; i++) out.push(tokens.slice(i, i + n).join(" "));
  return out;
}
function charWbNgrams(lowered: string, [lo, hi]: [number, number]): string[] {
  const out: string[] = [];
  for (const w0 of pySplit(pyCollapseWs2(lowered))) {
    const w = cps(" " + w0 + " ");
    const L = w.length;
    for (let n = lo; n <= hi; n++) {
      let off = 0;
      out.push(w.slice(off, off + n).join(""));
      while (off + n < L) { off++; out.push(w.slice(off, off + n).join("")); }
      if (off === 0) break;
    }
  }
  return out;
}

class Part {
  readonly col: Int32Array; // string index -> column (or -1)
  constructor(readonly spec: PartSpec, readonly idf: Float32Array, readonly offset: number, nStrings: number, terms: Uint32Array) {
    this.col = new Int32Array(nStrings).fill(-1);
    for (let j = 0; j < spec.n_features; j++) this.col[terms[offset + j]] = j;
  }
  /** Sparse l2-normalised tf-idf row as [globalColumn, value] pairs, sorted by column. */
  vector(lowered: string, index: Map<string, number>): [number, number][] {
    const grams = this.spec.analyzer === "word" ? wordNgrams(wordTokens(lowered), this.spec.ngram_range) : charWbNgrams(lowered, this.spec.ngram_range);
    const counts = new Map<number, number>();
    for (const g of grams) {
      const si = index.get(g);
      if (si === undefined) continue;
      const j = this.col[si];
      if (j < 0) continue;
      counts.set(j, (counts.get(j) ?? 0) + 1);
    }
    const row: [number, number][] = [];
    let norm = 0;
    for (const [j, c] of counts) {
      const tf = this.spec.sublinear_tf ? 1 + Math.log(c) : c;
      const v = tf * this.idf[j];
      row.push([j, v]);
      norm += v * v;
    }
    norm = Math.sqrt(norm);
    if (norm > 0) for (const r of row) r[1] /= norm;
    row.sort((a, b) => a[0] - b[0]);
    return row.map(([j, v]) => [this.offset + j, v]);
  }
}

export class LinearTextModel {
  readonly parts: Part[];
  readonly coef: Float32Array;
  readonly nCols: number;
  constructor(readonly spec: LinearSpec, buf: ArrayBuffer, nStrings: number, readonly index: Map<string, number>, readonly strings: string[]) {
    const terms = new Uint32Array(buf, spec.terms.offset, spec.terms.length);
    this.coef = new Float32Array(buf, spec.coef.offset, spec.coef.length);
    let off = 0;
    this.parts = spec.parts.map((p) => {
      const part = new Part(p, new Float32Array(buf, p.idf.offset, p.idf.length), off, nStrings, terms);
      off += p.n_features;
      return part;
    });
    this.nCols = off;
    this.termIndex = terms;
  }
  readonly termIndex: Uint32Array;
  vector(text: string): [number, number][] {
    const low = text.toLowerCase();
    return this.parts.flatMap((p) => p.vector(low, this.index));
  }
  /** decision_function for each class row (1 row for binary). */
  decision(x: [number, number][]): number[] {
    const [k, d] = this.spec.coef_shape;
    const out: number[] = [];
    for (let c = 0; c < k; c++) {
      let s = 0;
      for (const [j, v] of x) s += this.coef[c * d + j] * v;
      out.push(s + this.spec.intercept[c]);
    }
    return out;
  }
  logit(text: string): number { return this.decision(this.vector(text))[0]; }
  termOf(col: number): string { return this.strings[this.termIndex[col]]; }
  partOf(col: number): string { let o = 0; for (const p of this.parts) { if (col < o + p.spec.n_features) return p.spec.name; o += p.spec.n_features; } return ""; }

  /** Port of semantic.word_contributions: exact split of the logit over words. */
  wordContributions(text: string, top = 8): { terms: { term: string; contribution: number }[]; intercept: number; logit: number } {
    const x = this.vector(text);
    const words = wordTokens(text.toLowerCase());
    const padded = words.map((w) => ` ${w} `);
    const contrib = new Map<string, number>();
    const addC = (k: string, v: number) => contrib.set(k, (contrib.get(k) ?? 0) + v);
    let logit = 0;
    for (const [j, v] of x) {
      const c = this.coef[j] * v;
      logit += c;
      const feat = this.termOf(j);
      if (this.partOf(j) === "word") {
        const parts = feat.split(" ");
        for (const p of parts) addC(p, c / parts.length);
      } else {
        const owners = [...new Set(words.filter((_, i) => padded[i].includes(feat)))];
        if (!owners.length) { addC("<other>", c); continue; }
        for (const w of owners) addC(w, c / owners.length);
      }
    }
    logit += this.spec.intercept[0];
    const items = [...contrib.entries()].filter(([w]) => w !== "<other>").sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    return {
      terms: items.slice(0, top).map(([term, c]) => ({ term, contribution: pyRound(c, 4) })),
      intercept: pyRound(this.spec.intercept[0], 4), logit: pyRound(logit, 4),
    };
  }
}

export function decodeStrings(buf: ArrayBuffer, ref: { offset: number; bytes: number }): string[] {
  return new TextDecoder("utf-8").decode(new Uint8Array(buf, ref.offset, ref.bytes)).split("\n");
}
