// Port of backend/engines/trust_signals.py. Strictly lexical: no URL is visited or resolved.
import { RULES, SETS } from "./rules";
import { WB, cpLen, cps, escapeRe, isAlpha, isUpperChar, pyRound, rx, test, toAsciiDigits } from "./py";
import { obfTotal, type Preprocessed, type Span } from "./preprocess";

export type Severity = "info" | "low" | "medium" | "high";
export interface Signal { id: string; label: string; severity: Severity; detail: string; evidence: Span[] }
export interface UrlInfo {
  url: string; host: string; registered_domain: string; is_ip: boolean; tld: string; shortener: boolean;
  suspicious_tld: boolean; many_subdomains: boolean; subdomain_count: number; hyphens: number; punycode: boolean;
  has_at: boolean; insecure_scheme: boolean; official: boolean; lookalike_brand: string | null;
  digits_in_domain: boolean; defanged: boolean;
}

const DELEET: Record<string, string> = { "0": "o", "1": "l", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a", $: "s" };
const BRANDS = RULES.brands;

/** urllib.parse.urlsplit(u).hostname (Python 3.12), returning "" where Python raises ValueError. */
function pyHostname(u0: string): string {
  let u = u0.replace(/^[\x00-\x20]+/, "").replace(/[\t\r\n]/g, "");
  const i = u.indexOf(":");
  if (i > 0 && /^[A-Za-z]/.test(u) && /^[A-Za-z0-9+\-.]+$/.test(u.slice(0, i))) u = u.slice(i + 1);
  if (!u.startsWith("//")) return "";
  const rest = u.slice(2);
  const cut = rest.search(/[/?#]/);
  const netloc = cut === -1 ? rest : rest.slice(0, cut);
  const hasO = netloc.includes("["), hasC = netloc.includes("]");
  if (hasO !== hasC) return "";
  if (hasO && hasC) {
    const hp = netloc.slice(netloc.lastIndexOf("@") + 1);
    const b = hp.indexOf("[");
    if (b !== -1) {
      if (b > 0) return "";
      const inner = hp.slice(b + 1);
      const close = inner.indexOf("]");
      const host = close === -1 ? inner : inner.slice(0, close);
      const port = close === -1 ? "" : inner.slice(close + 1);
      if (port && !port.startsWith(":")) return "";
      if (!/^v[0-9a-f]+\.[a-z0-9._~!$&'()*+,;=:]+$/i.test(host) && !isIPv6(host)) return "";
    }
  }
  if (!/^[\x00-\x7f]*$/.test(netloc)) {
    const n = netloc.replace(/[@:#?]/g, "");
    const n2 = n.normalize("NFKC");
    if (n !== n2 && /[/?#@:]/.test(n2)) return "";
  }
  let host = netloc.slice(netloc.lastIndexOf("@") + 1);
  const ob = host.indexOf("[");
  if (ob !== -1) { const br = host.slice(ob + 1); host = br.split("]")[0]; }
  else host = host.split(":")[0];
  return host.toLowerCase();
}
function isIPv6(h: string): boolean {
  const s = h.split("%")[0];
  if (!/^[0-9a-f:.]+$/i.test(s) || (s.match(/::/g) ?? []).length > 1) return false;
  const parts = s.split(":");
  return parts.length >= 3 && parts.length <= 8 && parts.every((p) => p === "" || /^[0-9a-f]{1,4}$/i.test(p) || /^\d+\.\d+\.\d+\.\d+$/.test(p));
}

export function hostOf(url: string): string {
  let u = url.trim().replace(/[.,;:!?)\]}'"]+$/u, "");
  u = u.replace(/^hxxp/iu, "http");
  if (!/^[a-z]+:\/\//iu.test(u)) u = "http://" + u;
  return pyHostname(u).replace(/^\.+|\.+$/g, "");
}

export function registeredDomain(host: string): string {
  const labels = host.split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".");
  if (SETS.twoLevel.has(labels.slice(-2).join("."))) return labels.slice(-3).join(".");
  return labels.slice(-2).join(".");
}

function edit1(a0: string, b0: string): boolean {
  let a = cps(a0), b = cps(b0);
  if (a0 === b0) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) return a.filter((x, i) => x !== b[i]).length === 1;
  if (a.length > b.length) [a, b] = [b, a];
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return a.slice(i).join("") === b.slice(i + 1).join("");
}
const count = (s: string, ch: string) => s.split(ch).length - 1;

export function analyseUrl(url: string): UrlInfo {
  const host = hostOf(url);
  const reg = registeredDomain(host);
  const isIp = /^(?:\p{Nd}{1,3}\.){3}\p{Nd}{1,3}$/u.test(host);
  const tld = host.includes(".") ? host.slice(host.lastIndexOf(".") + 1) : "";
  const subCount = Math.max(0, count(host, ".") - count(reg, "."));
  const firstLabel = reg ? reg.split(".")[0] : "";
  const official = SETS.officialDomains.has(reg) || SETS.officialDomains.has(host);
  let lookalike: string | null = null;
  if (!official && !isIp) {
    const hay = cps(host).map((c) => DELEET[c] ?? c).join("");
    outer: for (const [name, b] of Object.entries(BRANDS)) {
      for (const d of b.domains) {
        const core = d.split(".")[0];
        if (cpLen(core) >= 4 && (hay.replace(/-/g, "").includes(core)
          || hay.split(/[.-]/).some((part) => cpLen(part) >= 4 && edit1(core, part)))) { lookalike = name; break outer; }
      }
      for (const kw of b.keywords) {
        const kw2 = kw.trim().replace(/ /g, "");
        const e = escapeRe(kw2);
        if (cpLen(kw2) >= 3 && new RegExp(`(?:^|[.-])${e}(?:[.-]|$)|${e}-`, "u").test(hay)) { lookalike = name; break outer; }
      }
    }
  }
  const low = url.toLowerCase();
  return {
    url, host, registered_domain: reg, is_ip: isIp, tld,
    shortener: SETS.shorteners.has(reg) || SETS.shorteners.has(host),
    suspicious_tld: SETS.suspiciousTlds.has(tld),
    many_subdomains: subCount >= 3, subdomain_count: subCount,
    hyphens: count(firstLabel, "-") + Math.floor(count(host, "-") / 2),
    punycode: host.includes("xn--"), has_at: url.includes("@"),
    insecure_scheme: low.startsWith("http://") || low.startsWith("hxxp://"),
    official, lookalike_brand: lookalike,
    digits_in_domain: /\p{Nd}/u.test(firstLabel) && !isIp,
    defanged: url.includes("[.]") || low.startsWith("hxxp"),
  };
}

const brandRe = new Map<string, RegExp>();
export function brandsMentioned(text: string): string[] {
  const low = text.toLowerCase();
  const out: string[] = [];
  for (const [name, b] of Object.entries(BRANDS)) {
    for (const kw0 of b.keywords) {
      const kw = kw0.trim();
      let r = brandRe.get(kw);
      if (!r) { r = new RegExp(WB + escapeRe(kw) + WB, "iu"); brandRe.set(kw, r); }
      if (r.test(low)) { out.push(name); break; }
    }
  }
  return out;
}

export function amountValue(s: string): number {
  const t = toAsciiDigits(s.toLowerCase().replace(/,/g, ""));
  const num = t.match(/\d+(?:\.\d+)?/);
  if (!num) return 0;
  let v = parseFloat(num[0]);
  if (t.includes("lakh") || t.includes("lac")) v *= 1e5;
  else if (t.includes("crore") || new RegExp(`${WB}cr${WB}`, "u").test(t) || t.includes("karod")) v *= 1e7;
  else if (new RegExp(`\\d[\\t\\n\\v\\f\\r\\x1c-\\x20\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]?k${WB}`, "u").test(t)) v *= 1e3;
  return v;
}

const TR = RULES.trust;
export function analyse(pre: Preprocessed): { signals: Signal[]; feats: Record<string, number>; urlInfo: UrlInfo[] } {
  const text = pre.normalized;
  const sig: Signal[] = [];
  const urlInfo = pre.urls.map((u) => analyseUrl(u.text));
  const nUrls = pre.urls.length + (pre.placeholders["url"] ?? 0);
  const nPhones = pre.phones.length + (pre.placeholders["phone"] ?? 0);
  const mentioned = brandsMentioned(text);
  const add = (id: string, label: string, severity: Severity, detail: string, evidence: Span[] = []) =>
    sig.push({ id, label, severity, detail, evidence });

  pre.urls.forEach((u, k) => {
    const info = urlInfo[k];
    if (info.shortener) add("shortened_link", "Shortened link", "medium", `'${info.registered_domain}' hides the real destination.`, [u]);
    if (info.is_ip) add("ip_link", "Link to a raw IP address", "high", "Legitimate services use domain names.", [u]);
    if (info.suspicious_tld) add("suspicious_tld", "Unusual domain ending", "medium", `'.${info.tld}' domains are cheap and common in phishing.`, [u]);
    if (info.lookalike_brand) add("lookalike_domain", "Look-alike domain", "high", `'${info.host}' resembles ${info.lookalike_brand.toUpperCase()} but is not one of its known domains.`, [u]);
    if (info.many_subdomains) add("many_subdomains", "Excessive sub-domains", "medium", `'${info.host}' has an unusually deep host name.`, [u]);
    if (info.punycode) add("punycode", "Internationalised (punycode) domain", "high", "Can disguise look-alike characters.", [u]);
    if (info.has_at) add("at_in_url", "'@' inside link", "high", "Text before '@' in a URL is ignored by browsers.", [u]);
    if (info.defanged) add("defanged_link", "Disguised link formatting", "medium", "Link written as hxxp or with [.] to evade filters.", [u]);
    if (info.official) add("official_domain", "Known official domain", "info", `'${info.registered_domain}' is on the local list of official domains (not a guarantee of safety).`, [u]);
  });
  const officialRegs = new Set(urlInfo.filter((i) => i.official).map((i) => i.registered_domain));
  let mismatch = false;
  if (mentioned.length && urlInfo.length) {
    for (const name of mentioned) {
      const owned = new Set(BRANDS[name].domains);
      const foreign = urlInfo.filter((i) => !i.official && !i.shortener && !owned.has(i.registered_domain) && !owned.has(i.host));
      if (foreign.length && ![...officialRegs].some((r) => owned.has(r))) {
        mismatch = true;
        add("brand_domain_mismatch", "Claimed brand ≠ link domain", "high",
          `Message mentions ${name.toUpperCase()} but links to '${foreign[0].registered_domain}'.`, [pre.urls[urlInfo.indexOf(foreign[0])]]);
        break;
      }
    }
  }
  if (pre.upi_ids.length) add("upi_id", "UPI ID present", "low", "A payment address is included in the message.", pre.upi_ids.slice(0, 2));
  const callReq = nPhones > 0 && test(rx(TR.CALL_RE), text);
  if (callReq) add("call_request", "Asks you to call / message a number", "low", "Verify numbers independently; scammers use personal mobile numbers.", pre.phones.slice(0, 2));
  const messaging = test(rx(TR.WHATSAPP_RE), text);
  if (messaging) add("messaging_app", "Moves conversation to WhatsApp/Telegram", "medium", "Moving off official channels is a common scam step.");
  const otp = test(rx(TR.OTP_RE), text);
  if (otp) add("otp_mention", "Mentions an OTP / verification code", "info", "Context decides whether this is safe.");
  const amounts = pre.amounts.map((a) => amountValue(a.text));
  const big = amounts.length ? Math.max(...amounts) : 0;
  if (big >= 50000) add("large_amount", "Large sum of money", "low", "Large amounts are typical of prize and loan lures.", pre.amounts.slice(0, 2));
  const o = pre.obfuscation;
  if (obfTotal(o) > 0) {
    const parts = Object.entries(o).filter(([, v]) => v).map(([k, v]) => `${v} ${k.replace(/_/g, " ")}`);
    add("obfuscation", "Disguised characters", o.homoglyphs || o.invisible_chars ? "medium" : "low",
      "Text uses " + parts.join(", ") + " - a common filter-evasion trick.");
  }
  const letters = cps(pre.original).filter(isAlpha);
  const caps = letters.length ? letters.filter(isUpperChar).length / letters.length : 0;
  const feats: Record<string, number> = {
    has_url: +(nUrls > 0),
    url_count: Math.min(nUrls, 3),
    url_shortener: +urlInfo.some((i) => i.shortener),
    url_ip: +urlInfo.some((i) => i.is_ip),
    url_suspicious_tld: +urlInfo.some((i) => i.suspicious_tld),
    url_lookalike: +urlInfo.some((i) => !!i.lookalike_brand),
    url_official: +(officialRegs.size > 0),
    url_risky_structure: +urlInfo.some((i) => i.many_subdomains || i.punycode || i.has_at || i.hyphens >= 2 || i.digits_in_domain || i.defanged),
    brand_domain_mismatch: +mismatch,
    brand_mentioned: +(mentioned.length > 0),
    has_phone: +(nPhones > 0),
    call_request: +callReq,
    messaging_app: +messaging,
    has_email: +(pre.emails.length > 0 || (pre.placeholders["email"] ?? 0) > 0),
    has_upi: +(pre.upi_ids.length > 0),
    has_money: +(pre.amounts.length > 0),
    large_amount: +(big >= 50000),
    otp_mention: +otp,
    pin_mention: +test(rx(TR.PIN_RE), text),
    suspension_word: +test(rx(TR.SUSPEND_RE), text),
    caps_ratio: pyRound(caps, 3),
    exclamations: Math.min(pre.original.split("!").length - 1, 5),
    obfuscation_total: Math.min(obfTotal(o), 5),
    log_length: pyRound(Math.log1p(cpLen(pre.original)), 3),
  };
  return { signals: sig, feats, urlInfo };
}
export { brandsMentioned as mentionedBrands };
