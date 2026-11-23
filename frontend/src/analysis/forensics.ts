// Offline forensics: links, payments, brand claims and sender IDs. Purely lexical — nothing is visited,
// resolved or looked up. These findings describe evidence; they do not change the model's verdict.
import { RULES, SETS } from "../engine/rules";
import { WB, finditer } from "../engine/py";
import { analyseUrl, brandsMentioned, hostOf } from "../engine/trust";
import { span } from "../engine/preprocess";
import type { EngineOutput, Span } from "../engine/types";

export type Level = "info" | "low" | "medium" | "high";
export interface Indicator { id: string; label: string; level: Level; detail: string; evidence?: Span[] }

// ------------------------------------------------------------------ punycode (RFC 3492 decode)
export function punycodeDecode(label: string): string | null {
  const base = 36, tMin = 1, tMax = 26, skew = 38, damp = 700;
  const input = label.toLowerCase().replace(/^xn--/, "");
  const out: number[] = [];
  let n = 128, i = 0, bias = 72;
  const b = input.lastIndexOf("-");
  for (let j = 0; j < Math.max(b, 0); j++) out.push(input.charCodeAt(j));
  const adapt = (delta: number, num: number, first: boolean) => {
    delta = first ? Math.floor(delta / damp) : delta >> 1;
    delta += Math.floor(delta / num);
    let k = 0;
    while (delta > ((base - tMin) * tMax) >> 1) { delta = Math.floor(delta / (base - tMin)); k += base; }
    return k + Math.floor(((base - tMin + 1) * delta) / (delta + skew));
  };
  for (let idx = b > 0 ? b + 1 : 0; idx < input.length;) {
    const oldi = i;
    for (let w = 1, k = base; ; k += base) {
      if (idx >= input.length) return null;
      const c = input.charCodeAt(idx++);
      const digit = c - 48 < 10 ? c - 22 : c - 65 < 26 ? c - 65 : c - 97 < 26 ? c - 97 : base;
      if (digit >= base) return null;
      i += digit * w;
      const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
      if (digit < t) break;
      w *= base - t;
    }
    bias = adapt(i - oldi, out.length + 1, oldi === 0);
    n += Math.floor(i / (out.length + 1));
    i %= out.length + 1;
    out.splice(i++, 0, n);
  }
  try { return String.fromCodePoint(...out); } catch { return null; }
}

// ------------------------------------------------------------------ URLs
const PATH_TERMS = ["login", "signin", "sign-in", "verify", "verification", "kyc", "update", "secure", "account", "wallet",
  "bank", "otp", "reward", "claim", "refund", "unlock", "confirm", "pay", "billing", "password", "prize", "gift", "bonus"];
const REDIRECT = /[?&](?:url|redirect|redirect_uri|next|goto|target|dest|destination|continue|return)=/i;
const DOWNLOAD = /\.(?:apk|exe|msi|bat|scr|zip|rar|ipa)(?:[?#]|$)/i;

export interface UrlForensics {
  url: string; host: string; registered_domain: string; scheme: string; tld: string; subdomains: string[];
  unicode_host: string | null; path: string; indicators: Indicator[]; official_for: string | null; risk: Level;
}

function splitUrl(url: string) {
  let u = url.replace(/^hxxp/i, "http").replace(/\[\.\]/g, ".");
  const scheme = /^https:\/\//i.test(u) ? "https" : /^http:\/\//i.test(u) ? "http" : "none";
  if (!/^[a-z]+:\/\//i.test(u)) u = "http://" + u;
  const afterScheme = u.replace(/^[a-z]+:\/\//i, "");
  const cut = afterScheme.search(/[/?#]/);
  const authority = cut === -1 ? afterScheme : afterScheme.slice(0, cut);
  const rest = cut === -1 ? "" : afterScheme.slice(cut);
  const at = authority.lastIndexOf("@");
  const userinfo = at === -1 ? "" : authority.slice(0, at);
  const hostport = authority.slice(at + 1);
  const port = /:(\d+)$/.exec(hostport)?.[1] ?? "";
  return { scheme, userinfo, port, rest };
}

export function urlForensics(url: string): UrlForensics {
  const base = analyseUrl(url);
  const host = base.host || hostOf(url);
  const { scheme, userinfo, port, rest } = splitUrl(url);
  const labels = host.split(".").filter(Boolean);
  const regLabels = base.registered_domain.split(".").filter(Boolean).length;
  const subdomains = labels.slice(0, Math.max(0, labels.length - regLabels));
  const ind: Indicator[] = [];
  const add = (id: string, label: string, level: Level, detail: string) => ind.push({ id, label, level, detail });
  let unicodeHost: string | null = null;
  if (base.punycode) {
    unicodeHost = labels.map((l) => (l.startsWith("xn--") ? punycodeDecode(l) ?? l : l)).join(".");
    add("punycode", "Internationalised (punycode) domain", "high", `Displays as '${unicodeHost}'. Mixed-script names can imitate familiar brands.`);
  }
  if (userinfo) add("credentials", "Text before '@' in the link", "high", `Browsers ignore '${userinfo}@' and go to '${host}', a classic way to fake a familiar address.`);
  if (base.is_ip) add("ip", "Raw IP address instead of a domain", "high", "Legitimate services almost always use domain names.");
  if (base.lookalike_brand) add("lookalike", "Resembles a known brand", "high", `'${host}' resembles ${base.lookalike_brand.toUpperCase()} but is not on its local list of domains. Spelling alone does not prove intent.`);
  const brandInSub = Object.entries(RULES.brands).find(([, b]) => !base.official && b.keywords.some((k) => {
    const kw = k.trim().toLowerCase().replace(/ /g, "");
    return kw.length >= 3 && subdomains.some((s) => s.includes(kw));
  }));
  if (brandInSub) add("brand_subdomain", "Brand name used as a sub-domain", "high", `The real domain is '${base.registered_domain}'; '${brandInSub[0].toUpperCase()}' appears only in front of it.`);
  if (base.shortener) add("shortener", "Shortened link", "medium", `'${base.registered_domain}' hides the final destination.`);
  if (base.suspicious_tld) add("tld", "Unusual domain ending", "medium", `'.${base.tld}' is cheap to register and common in reported phishing.`);
  if (base.many_subdomains) add("subdomains", "Unusually deep host name", "medium", `${base.subdomain_count} sub-domain levels.`);
  if (base.hyphens >= 2) add("hyphens", "Several hyphens in the domain", "low", "Hyphenated names such as 'secure-update-bank' are a common phishing pattern.");
  if (base.digits_in_domain) add("digits", "Digits in the domain name", "low", "Digits are sometimes used to imitate letters (0 for o, 1 for l).");
  if (base.defanged) add("defanged", "Disguised link formatting", "medium", "Written as hxxp or with [.] - typical of filter evasion (or of security write-ups).");
  if (port && !["80", "443"].includes(port)) add("port", "Non-standard port", "medium", `Port ${port} is unusual for public websites.`);
  if (REDIRECT.test(rest)) add("redirect", "Redirect parameter", "medium", "The link can forward you to another site.");
  if (DOWNLOAD.test(rest)) add("download", "Direct file download", "high", "Links that download apps or files (.apk, .exe) can install malware.");
  const terms = PATH_TERMS.filter((t) => rest.toLowerCase().includes(t));
  if (terms.length) add("path_terms", "Sensitive words in the path", "low", `Path mentions: ${terms.slice(0, 4).join(", ")}.`);
  if (url.length > 75) add("long", "Very long link", "low", `${url.length} characters; long links can hide the real domain.`);
  if (scheme === "http") add("http", "Unencrypted http link", "low", "Data sent to an http page is not encrypted.");
  let officialFor: string | null = null;
  if (base.official) {
    officialFor = Object.entries(RULES.brands).find(([, b]) => b.domains.includes(base.registered_domain) || b.domains.includes(host))?.[0] ?? null;
    add("official", "Domain on the local official list", "info", `'${base.registered_domain}' is listed for ${officialFor?.toUpperCase() ?? "a known organisation"}. This is not a guarantee: official sites can be compromised or misused.`);
  }
  const risk: Level = ind.some((i) => i.level === "high") ? "high" : ind.some((i) => i.level === "medium") ? "medium" : ind.some((i) => i.level === "low") ? "low" : "info";
  return { url, host, registered_domain: base.registered_domain, scheme, tld: base.tld, subdomains, unicode_host: unicodeHost, path: rest, indicators: ind, official_for: officialFor, risk };
}

// ------------------------------------------------------------------ payments
const re = (s: string) => new RegExp(s, "giu");
const PAY_PATTERNS: { id: string; label: string; level: Level; detail: string; rx: RegExp }[] = [
  { id: "pin_to_receive", label: "PIN requested to receive money", level: "high", detail: "You never need to enter a UPI PIN to receive money; entering it sends money.",
    rx: re(`${WB}(?:enter|put|type|use)${WB}[^.!?\\n]{0,30}${WB}(?:upi\\s+)?(?:pin|mpin)${WB}[^.!?\\n]{0,40}${WB}(?:receive|get|credit|claim|refund|cashback)`) },
  { id: "collect_request", label: "Collect / approval request", level: "high", detail: "Approving a collect request sends money from your account.",
    rx: re(`${WB}(?:approve|accept|authori[sz]e)${WB}[^.!?\\n]{0,25}${WB}(?:collect|request|payment|mandate)${WB}|${WB}collect\\s+request${WB}`) },
  { id: "qr_receive", label: "QR code to 'receive' money", level: "high", detail: "Scanning a QR code is for paying, not receiving.",
    rx: re(`${WB}scan${WB}[^.!?\\n]{0,30}${WB}(?:qr|code)${WB}[^.!?\\n]{0,40}${WB}(?:receive|get|claim|refund|prize|cashback)|${WB}qr${WB}[^.!?\\n]{0,30}${WB}(?:receive|claim)`) },
  { id: "advance_fee", label: "Up-front fee", level: "high", detail: "A fee to release a prize, loan or job is the core of advance-fee fraud.",
    rx: re(`${WB}(?:processing|registration|activation|clearance|release|handling|verification|insurance|token|refundable)\\s+(?:fee|fees|charge|charges|amount|deposit)${WB}`) },
  { id: "pay_to_personal", label: "Payment to a personal UPI ID or number", level: "medium", detail: "Organisations rarely ask for payment to an individual's UPI handle.",
    rx: re(`${WB}(?:pay|send|transfer)${WB}[^.!?\\n]{0,40}(?:@[a-z]{2,}|${WB}upi${WB})`) },
  { id: "refund_lure", label: "Refund or cashback lure", level: "medium", detail: "Unexpected refunds and cashback are common bait for payment scams.",
    rx: re(`${WB}(?:refund|cashback|cash\\s+back|reversal)${WB}[^.!?\\n]{0,40}${WB}(?:click|link|scan|approve|enter|claim|pending|process)`) },
];
const LEGIT_TXN = re(`${WB}(?:debited|credited|spent|received|paid)${WB}`);

export interface PaymentForensics { upi_ids: { id: string; handle: string }[]; amounts: string[]; indicators: Indicator[]; notification_like: boolean; summary: string }
export function paymentForensics(o: EngineOutput): PaymentForensics {
  const text = o.pre.normalized;
  const ind: Indicator[] = [];
  for (const p of PAY_PATTERNS) {
    const ms = finditer(p.rx, text);
    if (ms.length) ind.push({ id: p.id, label: p.label, level: p.level, detail: p.detail, evidence: ms.slice(0, 2).map((m) => span(o.pre, m.start, m.end)) });
  }
  if (o.features.otp_share_request) ind.push({ id: "otp_share", label: "Asks you to share an OTP / PIN", level: "high", detail: "No bank, app or delivery agent needs your OTP or PIN." });
  const requests = ind.some((i) => i.level === "high") || o.tacticHits.some((h) => h.id === "payment" || h.id === "sensitive_info");
  const notification = finditer(LEGIT_TXN, text).length > 0 && o.benign.templates.includes("transaction_alert") && !requests;
  const upi = o.pre.upi_ids.map((u) => ({ id: u.text, handle: u.text.split("@")[1] ?? "" }));
  const summary = ind.length
    ? `${ind.length} payment-risk indicator${ind.length > 1 ? "s" : ""} found.`
    : notification ? "Reads like a payment notification: it reports a transaction and does not ask you to pay, approve or enter a PIN."
      : upi.length || o.pre.amounts.length ? "Payment details are present but no request pattern was matched." : "No payment details found.";
  return { upi_ids: upi, amounts: o.pre.amounts.map((a) => a.text), indicators: ind, notification_like: notification, summary };
}

// ------------------------------------------------------------------ brand impersonation
export interface BrandClaim { brand: string; official_domains: string[]; link_relation: "official" | "unrelated" | "lookalike" | "shortened" | "none"; contact_channels: string[]; statement: string; short: string }
export function impersonation(o: EngineOutput): BrandClaim[] {
  const brands = brandsMentioned(o.pre.normalized);
  return brands.map((name) => {
    const b = RULES.brands[name];
    const owned = new Set(b.domains);
    const infos = o.urlInfo;
    let rel: BrandClaim["link_relation"] = "none";
    if (infos.some((i) => owned.has(i.registered_domain) || owned.has(i.host))) rel = "official";
    else if (infos.some((i) => i.lookalike_brand === name)) rel = "lookalike";
    else if (infos.some((i) => i.shortener)) rel = "shortened";
    else if (infos.length) rel = "unrelated";
    const ch: string[] = [];
    if (o.features.has_phone) ch.push("phone number");
    if (o.features.messaging_app) ch.push("WhatsApp / Telegram");
    if (o.features.has_upi) ch.push("UPI ID");
    const B = name.toUpperCase();
    const statement = {
      official: `Mentions ${B} and links to a domain on ${B}'s local list. That matches the claim but does not verify the sender.`,
      lookalike: `Mentions ${B} but links to a look-alike domain that is not on ${B}'s local list.`,
      unrelated: `Mentions ${B} but links to a domain that is not on ${B}'s local list.`,
      shortened: `Mentions ${B} but hides its link behind a shortener, so the destination cannot be compared with ${B}'s domains.`,
      none: ch.length ? `Mentions ${B} and asks you to use a ${ch.join(" / ")}; check it against ${B}'s official app or website.` : `Mentions ${B}; no link or contact detail to compare.`,
    }[rel];
    const short = {
      official: `Names ${B}; link is on ${B}'s list (sender not verified)`,
      lookalike: `Claims to be ${B}; links to a look-alike domain`,
      unrelated: `Claims to be ${B}; link is not a known ${B} domain`,
      shortened: `Claims to be ${B}; destination hidden by a shortener`,
      none: `Claims to be ${B} (official sender not verified)`,
    }[rel];
    return { brand: name, official_domains: b.domains, link_relation: rel, contact_channels: ch, statement, short };
  });
}

// ------------------------------------------------------------------ sender ID (optional user input)
export function senderForensics(sender: string): Indicator[] {
  const s = sender.trim();
  if (!s) return [];
  const out: Indicator[] = [];
  const digits = s.replace(/[\s()+-]/g, "");
  if (/^[A-Z]{2}-[A-Z0-9]{3,9}(?:-[SPTG])?$/i.test(s))
    out.push({ id: "header", label: "Business-style SMS header", level: "info", detail: "Looks like an Indian bulk-SMS header (e.g. AB-BANKXX). Headers can be registered by many businesses; this does not confirm who sent it." });
  else if (/^\+?\d{10,13}$/.test(digits)) {
    const intl = s.trim().startsWith("+") && !s.trim().startsWith("+91");
    out.push({ id: "mobile", label: intl ? "International mobile number" : "Personal mobile number", level: intl ? "medium" : "low",
      detail: intl ? "Banks and Indian services do not normally message from foreign personal numbers." : "Banks and large services usually send from business headers, not personal numbers." });
  } else if (/@/.test(s)) out.push({ id: "email", label: "E-mail-style sender", level: "low", detail: "SMS from an e-mail gateway can hide the real sender." });
  else out.push({ id: "other", label: "Unrecognised sender format", level: "low", detail: "Could not match a known sender format." });
  const brandHit = Object.entries(RULES.brands).find(([, b]) => b.keywords.some((k) => k.length >= 3 && s.toLowerCase().includes(k.toLowerCase().replace(/ /g, ""))));
  if (brandHit) out.push({ id: "sender_brand", label: `Sender name contains '${brandHit[0].toUpperCase()}'`, level: "info", detail: "Sender names are easy to imitate; the name alone is not verification." });
  return out;
}
export const officialDomainCount = () => SETS.officialDomains.size;
