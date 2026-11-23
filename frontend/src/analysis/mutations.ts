// Mutation Lab, ported from backend/services/mutations.py so it works offline in the browser.
// Same mutation rules; a different (but deterministic) random generator, so variants are not
// character-identical to the Python ones. Never invents real URLs.
import { RULES } from "../engine/rules";
import { rx, sub } from "../engine/py";
import { iterUrls } from "../engine/preprocess";

const M = RULES.mutations;
export const MUTATION_TYPES = M.MUTATION_TYPES;
export const TRAIN_AUGMENT_TYPES = ["char_substitution", "spacing", "mixed_case", "abbreviation", "hinglish"];
const TARGETS = new Set(M.TARGET_WORDS);

function hash(s: string): number {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  return h1 >>> 0;
}
class Rng {
  private a: number;
  constructor(seed: string) { this.a = hash(seed); }
  random(): number { let t = (this.a += 0x6d2b79f5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  int(lo: number, hi: number) { return lo + Math.floor(this.random() * (hi - lo + 1)); }
  choice<T>(xs: T[]): T { return xs[Math.floor(this.random() * xs.length)]; }
  sample<T>(xs: T[], k: number): T[] { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, k); }
}

interface W { start: number; end: number; text: string }
function targets(text: string): W[] {
  const words = [...text.matchAll(/[A-Za-z]{3,}/g)].map((m) => ({ start: m.index!, end: m.index! + m[0].length, text: m[0] }));
  const t = words.filter((w) => TARGETS.has(w.text.toLowerCase()));
  return t.length ? t : words;
}
function applyToWords(text: string, fn: (w: string) => string, rng: Rng, frac = 0.6): string {
  const ts = targets(text);
  if (!ts.length) return text;
  const k = Math.max(1, Math.round(ts.length * frac));
  const chosen = rng.sample(ts, Math.min(k, ts.length)).sort((a, b) => a.start - b.start);
  let out = "", pos = 0;
  for (const m of chosen) { out += text.slice(pos, m.start) + fn(m.text); pos = m.end; }
  return out + text.slice(pos);
}
function leet(w: string, rng: Rng): string {
  const idx = [...w].map((c, i) => (M.LEET_MAP[c.toLowerCase()] ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return w;
  const pick = new Set(rng.sample(idx, Math.max(1, Math.floor(idx.length / 2))));
  return [...w].map((c, i) => (pick.has(i) ? M.LEET_MAP[c.toLowerCase()] : c)).join("");
}
function protectUrls(text: string, fn: (t: string) => string): string {
  let out = "", pos = 0;
  for (const m of iterUrls(text)) { out += fn(text.slice(pos, m.start)) + m.text; pos = m.end; }
  return out + fn(text.slice(pos));
}

export function mutate(text: string, kind: string, seed = 0): string {
  const rng = new Rng(`${seed}:${kind}:${text}`);
  switch (kind) {
    case "char_substitution": return protectUrls(text, (t) => applyToWords(t, (w) => leet(w, rng), rng));
    case "spacing": return protectUrls(text, (t) => applyToWords(t, (w) => [...w].join(" "), rng, 0.4));
    case "punctuation_split": { const sep = rng.choice([".", "-", "*"]); return protectUrls(text, (t) => applyToWords(t, (w) => [...w].join(sep), rng, 0.4)); }
    case "mixed_case": return protectUrls(text, (t) => [...t].map((c) => (rng.random() < 0.5 ? c.toUpperCase() : c.toLowerCase())).join(""));
    case "abbreviation": return protectUrls(text, (t) => M.ABBREV.reduce((acc, [p, r]) => sub(rx(p), r, acc), t));
    case "unicode_confusables": return protectUrls(text, (t) => applyToWords(t, (w) => [...w].map((c) => (M.HOMOGLYPHS[c] && rng.random() < 0.6 ? M.HOMOGLYPHS[c] : c)).join(""), rng, 0.8));
    case "invisible_chars": return protectUrls(text, (t) => applyToWords(t, (w) => (w.length < 6 ? [...w].join("​") : w.slice(0, 2) + "​" + w.slice(2, 4) + "‌" + w.slice(4)), rng, 0.7));
    case "hinglish": return protectUrls(text, (t) => M.HINGLISH.reduce((acc, [p, r]) => sub(rx(p), r, acc), t));
    case "repeated_chars": {
      const t = protectUrls(text, (s) => applyToWords(s, (w) => { const i = rng.int(0, w.length - 1); return w.slice(0, i + 1) + w[i].repeat(rng.int(2, 4)) + w.slice(i + 1); }, rng, 0.5));
      let n = 0;
      return t.replace(/([!?.])(\s|$)/g, (m, a, b) => (n++ < 2 ? a.repeat(rng.int(2, 4)) + b : m));
    }
    case "url_variation": {
      const urls = iterUrls(text);
      if (!urls.length) return text;
      let out = "", pos = 0;
      for (const m of urls) {
        let u = m.text;
        const style = rng.choice(["defang", "brackets", "noscheme", "upper"]);
        if (style === "defang") u = /^http/i.test(u) ? u.replace(/^https?/i, "hxxp") : "hxxp://" + u;
        else if (style === "brackets") u = u.replace(/\./g, "[.]");
        else if (style === "noscheme") u = u.replace(/^https?:\/\//i, "");
        else u = u.toUpperCase();
        out += text.slice(pos, m.start) + u;
        pos = m.end;
      }
      return out + text.slice(pos);
    }
    case "combined": return mutate(mutate(mutate(text, "char_substitution", seed), "spacing", seed + 1), "mixed_case", seed + 2);
    default: throw new Error(`unknown mutation type: ${kind}`);
  }
}

export interface Variant { type: string; description: string; text: string; changed: boolean }
export function generate(text: string, types?: string[], perType = 1, seed = 0): Variant[] {
  const out: Variant[] = [];
  for (const k of types ?? Object.keys(MUTATION_TYPES)) {
    const seen = new Set<string>();
    for (let v = 0; v < perType; v++) {
      const t = mutate(text, k, seed + v * 7919);
      if (seen.has(t)) continue;
      seen.add(t);
      out.push({ type: k, description: MUTATION_TYPES[k], text: t, changed: t !== text });
    }
  }
  return out;
}
