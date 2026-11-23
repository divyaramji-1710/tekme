// Port of backend/preprocessing/{obfuscation,hinglish,normalizer}.py. Same steps, same order.
import { RULES, SETS, VOCAB, get } from "./rules";
import {
  cpLen, cps, finditer, isAlnum, isAlpha, isLatin, pyCollapseWs, pySplit, pyStrip, rx, search, strIsUpper, sub, test, type M,
} from "./py";

export interface Span { text: string; start: number; end: number }
export interface ObfuscationStats {
  invisible_chars: number; homoglyphs: number; leet_tokens: number; spaced_words: number;
  repeated_chars: number; mixed_script_tokens: number;
}
export const obfTotal = (o: ObfuscationStats) =>
  o.invisible_chars + o.homoglyphs + o.leet_tokens + o.spaced_words + o.repeated_chars + o.mixed_script_tokens;

export interface Preprocessed {
  original: string;
  normalized: string;
  offsets: [number, number][]; // per UTF-16 unit of `normalized`: [start, end) in `original`
  model_text: string;
  language: string;
  urls: Span[]; emails: Span[]; phones: Span[]; upi_ids: Span[]; amounts: Span[]; codes: Span[];
  placeholders: Record<string, number>;
  obfuscation: ObfuscationStats;
  examples: string[];
}

const P = RULES.patterns;
const CONF = RULES.obfuscation.CONFUSABLES;
const LEET = RULES.obfuscation.LEET;
// Python str.isdigit(): decimal digits plus superscripts, subscripts, circled digits and similar.
const PY_DIGIT = /^[\p{Nd}²³¹⁰⁴-⁹₀-₉①-⑨⑴-⑼⒈-⒐⓪⓵-⓽⓿❶-❾➀-➈➊-➒፩-፱᧚]$/u;
const isPyDigit = (c: string) => c.length > 0 && PY_DIGIT.test(c);

export function toOriginal(pre: Preprocessed, start: number, end: number): [number, number] {
  const o = pre.offsets;
  if (!o.length || start >= end) return [0, 0];
  start = Math.max(0, Math.min(start, o.length - 1));
  end = Math.max(start + 1, Math.min(end, o.length));
  return [o[start][0], o[end - 1][1]];
}
export function span(pre: Preprocessed, start: number, end: number): Span {
  const [s, e] = toOriginal(pre, start, end);
  return { text: pre.original.slice(s, e), start: s, end: e };
}

// ------------------------------------------------------------------ obfuscation
function cleanChars(text: string, stats: ObfuscationStats): { s: string; m: [number, number][] } {
  const chars: { c: string; i: number }[] = [];
  for (let i = 0; i < text.length;) {
    const c = String.fromCodePoint(text.codePointAt(i)!);
    chars.push({ c, i });
    i += c.length;
  }
  let latin = 0, nonLatin = 0;
  for (const { c } of chars) {
    if (isLatin(c)) latin++;
    else if (isAlpha(c) && get(CONF, c) === undefined) nonLatin++;
  }
  const latinDominant = latin >= nonLatin;
  let s = "";
  const m: [number, number][] = [];
  const push = (out: string, a: number, b: number) => {
    s += out;
    for (let k = 0; k < out.length; k++) m.push([a, b]);
  };
  chars.forEach(({ c, i }, k) => {
    const a = i, b = i + c.length;
    if (SETS.invisible.has(c)) {
      if (SETS.indicSafe.has(c)) {
        const prev = k > 0 ? chars[k - 1].c : "";
        const nxt = k + 1 < chars.length ? chars[k + 1].c : "";
        if (!(isLatin(prev) || isLatin(nxt) || isPyDigit(prev) || isPyDigit(nxt))) { push(c, a, b); return; }
      }
      stats.invisible_chars++;
      return;
    }
    const conf = get(CONF, c);
    if (conf !== undefined && latinDominant) { stats.homoglyphs++; push(conf, a, b); return; }
    const norm = c.normalize("NFKC");
    if (norm !== c && isAlnum(c) && cps(norm).every((x) => isLatin(x) || isPyDigit(x))) stats.homoglyphs++;
    for (const x of cps(norm)) push(x, a, b);
  });
  return { s, m };
}

function deleet(token: string): string | null {
  const low = token.toLowerCase();
  if (VOCAB.has(low)) return null;
  const chars = cps(low);
  if (!chars.some(isAlpha) || !chars.some((c) => Object.prototype.hasOwnProperty.call(LEET, c))) return null;
  const digits = chars.filter(isPyDigit).length;
  if (digits > Math.max(2, Math.floor(chars.length / 2))) return null;
  const options = chars.map((c) => (Object.prototype.hasOwnProperty.call(LEET, c) ? LEET[c] : [c]));
  let combos = 1;
  for (const o of options) combos *= o.length;
  if (combos <= 256) {
    // itertools.product order: last position varies fastest
    const idx = new Array(options.length).fill(0);
    for (;;) {
      const cand = idx.map((j, p) => options[p][j]).join("");
      if (VOCAB.has(cand)) return cand;
      let p = options.length - 1;
      while (p >= 0 && ++idx[p] === options[p].length) { idx[p] = 0; p--; }
      if (p < 0) break;
    }
  } else return null;
  const stripped = low.replace(/[!$]+$/u, "");
  if (stripped !== low && stripped) {
    const r = deleet(stripped);
    if (r) return r + cps(token).slice(cpLen(stripped)).join("");
    if (VOCAB.has(stripped)) return null;
  }
  return null;
}

function collapseRepeats(token: string): string | null {
  const re = rx(RULES.obfuscation._REPEAT_RE);
  if (!test(re, token)) return null;
  const one = sub(re, (m) => m.groups[0]!, token);
  if (VOCAB.has(one.toLowerCase())) return one;
  const two = sub(re, (m) => m.groups[0]! + m.groups[0]!, token);
  if (VOCAB.has(two.toLowerCase())) return two;
  return one;
}

function matchCase(src: string, repl: string): string {
  if (strIsUpper(src) && cpLen(src) > 1) return repl.toUpperCase();
  const first = cps(src)[0] ?? "";
  if (strIsUpper(first)) { const r = cps(repl); return (r[0] ?? "").toUpperCase() + r.slice(1).join(""); }
  return repl;
}

// ------------------------------------------------------------------ hinglish
export function canonicalToken(tok: string): string | null {
  const low = tok.toLowerCase();
  const ab = get(RULES.hinglish.ABBREVIATIONS, low);
  if (ab !== undefined && ab !== low) return ab;
  const v = get(RULES.hinglish.VARIANT_MAP, low);
  return v !== undefined ? v : null;
}
export function glosses(text: string): string[] {
  const out: string[] = [];
  for (const m of finditer(rx(RULES.hinglish._WORD_RE), text.toLowerCase())) {
    const g = get(RULES.hinglish.GLOSS, m.text);
    if (g) out.push(...g.split(" ").filter(Boolean));
  }
  return out;
}
export function detectLanguage(text: string): string {
  const letters = cps(text).filter(isAlpha);
  if (!letters.length) return "en";
  const deva = letters.filter((c) => c >= "\u0900" && c <= "ॿ").length;
  if (deva / letters.length > 0.3) return "hi";
  const words = (text.match(/[a-zA-Z]+/g) ?? []).map((w) => w.toLowerCase());
  if (!words.length) return "en";
  const canon = words.map((w) => get(RULES.hinglish.VARIANT_MAP, w) ?? w);
  const regional = canon.filter((w) => SETS.regionalMarkers.has(w)).length;
  const hing = canon.filter((w) => SETS.hinglishMarkers.has(w)).length;
  if (regional >= 2 && regional >= hing * 0.5) return "regional_mixed";
  if (hing >= 2 && hing / words.length >= 0.1) return "hinglish";
  return "en";
}

// ------------------------------------------------------------------ patterns.py helpers
const URL_PREFIX = /^(?:(?:https?|hxxps?):\/\/|www\.)/iu;
const IP_FULL = /^(?:\p{Nd}{1,3}\.){3}\p{Nd}{1,3}(?::\p{Nd}+)?$/u;
function plausibleUrl(t: string): boolean {
  if (URL_PREFIX.test(t) || t.includes("/")) return true;
  if (IP_FULL.test(t)) return true;
  return t.split(".").slice(1).every((l) => l === l.toLowerCase());
}
export function iterUrls(text: string): M[] {
  return finditer(rx(P.URL_RE), text).filter((m) => plausibleUrl(m.text));
}
export function subUrls(repl: string, text: string): string {
  let out = "", pos = 0;
  for (const m of iterUrls(text)) { out += text.slice(pos, m.start) + repl; pos = m.end; }
  return out + text.slice(pos);
}

// ------------------------------------------------------------------ normalizer
type Piece = [number, number, string];
function protectedSpans(text: string): Piece[] {
  const taken: Piece[] = [];
  const add = (ms: M[], kind: string) => {
    for (const m of ms) {
      if (taken.some(([a, b]) => !(m.end <= a || m.start >= b))) continue;
      taken.push([m.start, m.end, kind]);
    }
  };
  add(finditer(rx(P.PLACEHOLDER_RE), text), "placeholder");
  add(iterUrls(text), "url");
  add(finditer(rx(P.UPI_RE), text), "upi");
  add(finditer(rx(P.EMAIL_RE), text), "email");
  add(finditer(rx(P.PHONE_RE), text), "phone");
  return taken.sort((x, y) => x[0] - y[0] || x[1] - y[1] || (x[2] < y[2] ? -1 : x[2] > y[2] ? 1 : 0));
}
function tokenizePlain(text: string, start: number, end: number): Piece[] {
  const out: Piece[] = [];
  let pos = start;
  for (const m of finditer(rx(RULES.normalizer._WORD_RE), text, start, end)) {
    if (m.start > pos) out.push([pos, m.start, "other"]);
    out.push([m.start, m.end, "word"]);
    pos = m.end;
  }
  if (pos < end) out.push([pos, end, "other"]);
  return out;
}
function tokenize(text: string): Piece[] {
  const pieces: Piece[] = [];
  let pos = 0;
  for (const [s, e, kind] of protectedSpans(text)) {
    pieces.push(...tokenizePlain(text, pos, s), [s, e, kind]);
    pos = e;
  }
  pieces.push(...tokenizePlain(text, pos, text.length));
  return pieces;
}
const SEP_FULL = new RegExp(`^(?:${RULES.normalizer._SEP_RE.source})(?![\\s\\S])`, RULES.normalizer._SEP_RE.flags);
const single = (text: string, s: number, e: number) => cpLen(text.slice(s, e)) === 1 && isAlnum(text.slice(s, e));

function mergeSpaced(text: string, pieces: Piece[], stats: ObfuscationStats, examples: string[]): [number, number, string, string][] {
  const out: [number, number, string, string][] = [];
  let i = 0;
  const n = pieces.length;
  while (i < n) {
    const [s, e, kind] = pieces[i];
    if (kind === "word" && single(text, s, e)) {
      let j = i, last = i;
      const letters = [text.slice(s, e)];
      while (j + 2 < n && pieces[j + 1][2] === "other" && SEP_FULL.test(text.slice(pieces[j + 1][0], pieces[j + 1][1]))
        && pieces[j + 2][2] === "word" && single(text, pieces[j + 2][0], pieces[j + 2][1])) {
        letters.push(text.slice(pieces[j + 2][0], pieces[j + 2][1]));
        j += 2;
        last = j;
      }
      const merged = letters.join("");
      const low = merged.toLowerCase();
      const lowc = cps(low);
      if (letters.length >= 3 && lowc.some(isAlpha)
        && (VOCAB.has(low) || SETS.acronyms.has(low) || (lowc.length >= 5 && lowc.every(isAlpha)))) {
        stats.spaced_words++;
        examples.push(text.slice(s, pieces[last][1]));
        out.push([s, pieces[last][1], "word", merged]);
        i = last + 1;
        continue;
      }
    }
    out.push([s, e, kind, ""]);
    i++;
  }
  return out;
}

function transformWord(tok: string, stats: ObfuscationStats, examples: string[]): string {
  let word = tok;
  const r = collapseRepeats(word);
  if (r !== null && r !== word) { stats.repeated_chars++; word = r; }
  const d = deleet(word);
  if (d !== null) { stats.leet_tokens++; examples.push(tok); word = matchCase(word, d); }
  const c = canonicalToken(word);
  if (c !== null) word = matchCase(word, c);
  return word;
}

export function preprocess(text: string): Preprocessed {
  const original = String(text);
  const stats: ObfuscationStats = { invisible_chars: 0, homoglyphs: 0, leet_tokens: 0, spaced_words: 0, repeated_chars: 0, mixed_script_tokens: 0 };
  const examples: string[] = [];
  const { s: s1, m: m1 } = cleanChars(original, stats);
  stats.mixed_script_tokens = pySplit(original)
    .filter((t) => cps(t).some((c) => get(CONF, c) !== undefined) && cps(t).some(isLatin)).length;

  const pieces = mergeSpaced(s1, tokenize(s1), stats, examples);
  let normalized = "";
  const offsets: [number, number][] = [];
  for (const [s, e, kind, merged] of pieces) {
    const piece = s1.slice(s, e);
    const neu = kind === "word" ? transformWord(merged || piece, stats, examples) : piece;
    if (neu === piece) {
      for (let k = s; k < e; k++) offsets.push(m1[k]);
      normalized += piece;
    } else {
      const sp: [number, number] = m1.length ? [m1[s][0], m1[e - 1][1]] : [0, 0];
      for (let k = 0; k < neu.length; k++) offsets.push(sp);
      normalized += neu;
    }
  }
  const pre: Preprocessed = {
    original, normalized, offsets, model_text: "", language: detectLanguage(normalized),
    urls: [], emails: [], phones: [], upi_ids: [], amounts: [], codes: [], placeholders: {}, obfuscation: stats, examples,
  };
  for (const m of finditer(rx(P.PLACEHOLDER_RE), normalized)) {
    const key = m.text.slice(1, -1).toLowerCase();
    pre.placeholders[key] = (pre.placeholders[key] ?? 0) + 1;
  }
  const find = (ms: M[]) => ms.map((m) => span(pre, m.start, m.end));
  pre.urls = find(iterUrls(normalized));
  pre.upi_ids = find(finditer(rx(P.UPI_RE), normalized));
  const upiTexts = new Set(pre.upi_ids.map((u) => u.text));
  pre.emails = find(finditer(rx(P.EMAIL_RE), normalized)).filter((x) => !upiTexts.has(x.text));
  const urlR = pre.urls.map((u) => [u.start, u.end]);
  pre.phones = find(finditer(rx(P.PHONE_RE), normalized)).filter((p) => !urlR.some(([a, b]) => a <= p.start && p.start < b));
  pre.amounts = find(finditer(rx(P.MONEY_RE), normalized));
  const phR = pre.phones.map((p) => [p.start, p.end]);
  pre.codes = find(finditer(rx(P.CODE_RE), normalized))
    .filter((c) => ![...phR, ...urlR].some(([a, b]) => a <= c.start && c.start < b) && !pre.amounts.some((a) => a.start <= c.start && c.start < a.end));
  pre.model_text = buildModelText(normalized);
  return pre;
}

const PH_MAP: Record<string, string> = { "<URL>": " xurlx ", "<PHONE_NUMBER>": " xphonex ", "<EMAIL_ADDRESS>": " xemailx ", "<NUMBER>": " xnumx " };
export function buildModelText(normalized: string): string {
  let t = normalized;
  t = sub(rx(P.PLACEHOLDER_RE), (m) => PH_MAP[m.text], t);
  t = subUrls(" xurlx ", t);
  t = sub(rx(P.UPI_RE), " xupix ", t);
  t = sub(rx(P.EMAIL_RE), " xemailx ", t);
  t = sub(rx(P.PHONE_RE), " xphonex ", t);
  t = sub(rx(P.LONG_NUMBER_RE), " xnumx ", t);
  t = t.toLowerCase();
  t = pyStrip(pyCollapseWs(t));
  const g = glosses(normalized);
  if (g.length) t = t + " " + g.join(" ");
  return t;
}
export { search };
