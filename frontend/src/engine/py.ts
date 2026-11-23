// Helpers that reproduce Python string semantics in JavaScript.
// Python indexes strings by code point; JavaScript by UTF-16 unit. Offsets inside the engine are UTF-16
// (what the UI needs), and every length / window that Python measures in code points is measured here
// in code points too, so both engines take the same decisions.

export interface RxSpec { source: string; flags: string }

export const W_CLASS = "[\\p{L}\\p{N}_]";
export const WB = `(?:(?<=${W_CLASS})(?!${W_CLASS})|(?<!${W_CLASS})(?=${W_CLASS}))`;
// Python str.isspace() code points.
const PY_WS = "\\t\\n\\v\\f\\r\\x1c-\\x20\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
export const PY_WS_RE = new RegExp(`[${PY_WS}]+`, "gu");
const PY_WS_TRIM = new RegExp(`^[${PY_WS}]+|[${PY_WS}]+$`, "gu");
const PY_WS2 = new RegExp(`[${PY_WS}][${PY_WS}]+`, "gu");

const cache = new Map<string, RegExp>();
/** Compile an exported pattern. Always global + unicode so it can be used with exec loops. */
export function rx(spec: RxSpec, sticky = false): RegExp {
  const key = spec.source + "/" + spec.flags + (sticky ? "y" : "");
  let r = cache.get(key);
  if (!r) {
    r = new RegExp(spec.source, spec.flags + "g" + (sticky ? "y" : ""));
    cache.set(key, r);
  }
  r.lastIndex = 0;
  return r;
}

export interface M { start: number; end: number; text: string; groups: (string | undefined)[] }

/** Python re.finditer(text, pos, endpos): the string is truncated at endpos; lookbehind may see before pos. */
export function finditer(re: RegExp, text: string, pos = 0, endpos = text.length): M[] {
  const s = endpos < text.length ? text.slice(0, endpos) : text;
  const out: M[] = [];
  re.lastIndex = pos;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    out.push({ start: m.index, end: m.index + m[0].length, text: m[0], groups: m.slice(1) });
    if (m[0].length === 0) re.lastIndex = m.index + cpLenAt(s, m.index);
  }
  re.lastIndex = 0;
  return out;
}
export function search(re: RegExp, text: string): M | null {
  re.lastIndex = 0;
  const m = re.exec(text);
  re.lastIndex = 0;
  return m ? { start: m.index, end: m.index + m[0].length, text: m[0], groups: m.slice(1) } : null;
}
export const test = (re: RegExp, text: string): boolean => search(re, text) !== null;

/** Python re.sub with a string or function replacement (no group templates). */
export function sub(re: RegExp, repl: string | ((m: M) => string), text: string): string {
  let out = "";
  let pos = 0;
  for (const m of finditer(re, text)) {
    out += text.slice(pos, m.start) + (typeof repl === "string" ? repl : repl(m));
    pos = m.end;
  }
  return out + text.slice(pos);
}

export function cpLenAt(s: string, i: number): number {
  const c = s.charCodeAt(i);
  return c >= 0xd800 && c <= 0xdbff && i + 1 < s.length ? 2 : 1;
}
export const cps = (s: string): string[] => Array.from(s);
export const cpLen = (s: string): number => { let n = 0; for (const _ of s) n++; return n; };

/** text[max(0, i - n):i] measured in code points. */
export function cpBefore(text: string, i: number, n: number): string {
  let j = i;
  for (let k = 0; k < n && j > 0; k++) {
    const c = text.charCodeAt(j - 1);
    j -= c >= 0xdc00 && c <= 0xdfff && j - 2 >= 0 && text.charCodeAt(j - 2) >= 0xd800 && text.charCodeAt(j - 2) <= 0xdbff ? 2 : 1;
  }
  return text.slice(j, i);
}
/** text[i:i + n] measured in code points. */
export function cpAfter(text: string, i: number, n: number): string {
  let j = i;
  for (let k = 0; k < n && j < text.length; k++) j += cpLenAt(text, j);
  return text.slice(i, j);
}

const ALPHA = /^\p{L}$/u;
const ALNUM = /^[\p{L}\p{N}]$/u;
const DIGIT = /^\p{Nd}$/u;
export const isAlpha = (c: string) => ALPHA.test(c);
export const isAlnum = (c: string) => ALNUM.test(c);
export const isDigit = (c: string) => DIGIT.test(c);
export const isUpperChar = (c: string) => /^\p{Lu}$/u.test(c);
/** Python str.isupper(): at least one cased character and no lower/title-case ones. */
export const strIsUpper = (s: string) => /[\p{Lu}]/u.test(s) && !/[\p{Ll}\p{Lt}]/u.test(s);
export const isLatin = (ch: string) => { const l = ch.toLowerCase(); return l >= "a" && l <= "z"; };

export const pySplit = (s: string): string[] => s.split(PY_WS_RE).filter((x) => x.length > 0);
export const pyStrip = (s: string): string => s.replace(PY_WS_TRIM, "");
export const pyCollapseWs = (s: string, rep = " "): string => s.replace(PY_WS_RE, rep);
export const pyCollapseWs2 = (s: string): string => s.replace(PY_WS2, " ");

/** Python round(x, nd): correctly rounded, ties to even on exactly representable halves. */
export function pyRound(x: number, nd = 0): number {
  if (!Number.isFinite(x) || Math.abs(x) >= 1e15) return x;
  const neg = x < 0;
  // toFixed with enough digits yields the exact decimal expansion of the binary double.
  const [ip, fp = ""] = Math.abs(x).toFixed(Math.min(100, nd + 70)).split(".");
  const keep = fp.slice(0, nd), rest = fp.slice(nd);
  const base = Number(ip + (nd ? "." + keep : ""));
  let up: boolean;
  if (rest[0] > "5") up = true;
  else if (rest[0] < "5") up = false;
  else if (/[1-9]/.test(rest.slice(1))) up = true;
  else up = Number((ip + keep).slice(-1)) % 2 === 1; // exact tie: half to even
  const v = up ? Number((base + 10 ** -nd).toFixed(nd)) : base;
  return neg ? -v : v;
}

export function escapeRe(s: string): string {
  return s.replace(/[\\^$.*+?()[\]{}|/]/g, "\\$&");
}

// Numeric value of a Unicode decimal digit (common scripts; others count as 0, documented in PARITY.md).
const DIGIT_ZEROS = [0x30, 0x660, 0x6f0, 0x966, 0x9e6, 0xa66, 0xae6, 0xb66, 0xbe6, 0xc66, 0xce6, 0xd66, 0xe50, 0xff10];
export function digitValue(c: string): number {
  const cp = c.codePointAt(0)!;
  for (const z of DIGIT_ZEROS) if (cp >= z && cp <= z + 9) return cp - z;
  return 0;
}
export const toAsciiDigits = (s: string) => s.replace(/\p{Nd}/gu, (c) => String(digitValue(c)));
