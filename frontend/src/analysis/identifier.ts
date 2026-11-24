// Standalone link / UPI ID check. The message model is trained on whole messages: a bare link or UPI ID is far
// outside that distribution (measured: genuine links such as onlinesbi.sbi and amazon.in came back SCAM, and a
// suspicious UPI ID came back SAFE). So when the input is a single link or UPI ID, TEKMĒ runs this transparent,
// rule-based check instead of the model and says so in the UI (DECISIONS.md D33). Purely lexical: nothing is
// opened, resolved or looked up.
import { RULES } from "../engine/rules";
import { finditer, rx } from "../engine/py";
import { hostOf } from "../engine/trust";
import { urlForensics, type Indicator, type Level, type UrlForensics } from "./forensics";

export type InputMode = "message" | "url" | "upi";
export type IdentifierKind = "url" | "upi";
/** SUSPICIOUS = red flags found; OFFICIAL = domain on the local official list; UNVERIFIED = no strong signal either way. */
export type IdentifierVerdict = "SUSPICIOUS" | "OFFICIAL" | "UNVERIFIED";

export interface IdentifierCheck {
  kind: IdentifierKind;
  value: string;
  verdict: IdentifierVerdict;
  summary: string;
  indicators: Indicator[];
  steps: string[];
  url: UrlForensics | null;
  analysed_at: string;
}

const RANK: Record<Level, number> = { high: 0, medium: 1, low: 2, info: 3 };
const byLevel = (a: Indicator, b: Indicator) => RANK[a.level] - RANK[b.level];

/** True when one match of `re` covers the whole of `t`. */
function whole(re: RegExp, t: string): boolean {
  return finditer(re, t).some((m) => m.start === 0 && m.end === t.length);
}
const URL_RE = rx(RULES.patterns.URL_RE);
const UPI_RE = rx(RULES.patterns.UPI_RE);
const LOOSE_UPI = /^[\p{L}\p{N}_.-]{2,}@[a-z][a-z0-9]{1,24}$/iu;

/**
 * Returns the single link or UPI ID the input consists of, or null when it is a message (any whitespace,
 * or not shaped like a link / UPI ID). In "message" mode only unambiguous shapes are taken (the engine's own
 * URL and UPI patterns); the URL and UPI ID tabs also accept looser shapes the user has declared.
 */
export function detectIdentifier(text: string, mode: InputMode = "message"): { kind: IdentifierKind; value: string } | null {
  const t = text.trim().replace(/[.,;:!?)\]}'"]+$/u, "");
  if (!t || /\s/u.test(t)) return null;
  if (!t.includes("/") && t.includes("@")) {
    if (whole(UPI_RE, t) || (mode === "upi" && LOOSE_UPI.test(t))) return { kind: "upi", value: t };
    if (!/^[a-z]+:\/\//iu.test(t)) return null; // an e-mail address, not a link
  }
  if (whole(URL_RE, t)) return { kind: "url", value: t };
  if (mode === "url") {
    const host = hostOf(t.replace(/\[\.\]/g, "."));
    const tld = host.slice(host.lastIndexOf(".") + 1);
    if (host.includes(".") && /^\p{L}{2,}$/u.test(tld)) return { kind: "url", value: t };
  }
  return null;
}

// ------------------------------------------------------------------ links
export function checkUrl(value: string): IdentifierCheck {
  const u = urlForensics(value);
  const ind = [...u.indicators].sort(byLevel);
  const warnings = ind.filter((i) => i.level !== "info");
  const high = ind.filter((i) => i.level === "high");
  const medium = ind.filter((i) => i.level === "medium");
  const top = warnings[0];
  let verdict: IdentifierVerdict;
  if (high.length) verdict = "SUSPICIOUS";
  else if (u.official_for) verdict = "OFFICIAL";
  else if (medium.length && warnings.length >= 2) verdict = "SUSPICIOUS";
  else verdict = "UNVERIFIED";
  const brand = u.official_for?.toUpperCase();
  const summary = {
    SUSPICIOUS: `This link shows ${warnings.length} warning sign${warnings.length > 1 ? "s" : ""}; the strongest is: ${top?.label.toLowerCase()}. Treat it as a likely phishing link.`,
    OFFICIAL: `'${u.registered_domain}' is on the local list of official ${brand ?? "organisation"} domains.${warnings.length ? ` It still has ${warnings.length} minor warning${warnings.length > 1 ? "s" : ""} (${warnings.map((w) => w.label.toLowerCase()).join(", ")}).` : ""} That is a good sign, but it does not prove who sent it to you.`,
    UNVERIFIED: medium.length
      ? `${top!.label}: ${top!.detail} TEKMĒ cannot see where it leads, so it cannot vouch for it.`
      : `No red flags were found, but '${u.registered_domain || u.host}' is not on the local list of official domains, so TEKMĒ cannot vouch for it.`,
  }[verdict];
  const steps = {
    SUSPICIOUS: [
      "Don't open the link or enter any details on the page it leads to.",
      "If it claims to be a bank or service, use their official app or type their address yourself.",
    ],
    OFFICIAL: [
      "Prefer opening the official app, or typing the address yourself, over tapping a link in a message.",
      "Never share an OTP, PIN or password, even on a page that looks official.",
    ],
    UNVERIFIED: [
      "Only open it if you know and trust the sender, and you were not pressured to act quickly.",
      "Never enter an OTP, PIN or card details on a page you reached from a message link.",
    ],
  }[verdict];
  steps.push("To judge the link in context, paste the whole message instead of the link alone.");
  return { kind: "url", value, verdict, summary, indicators: ind, steps, url: u, analysed_at: new Date().toISOString() };
}

// ------------------------------------------------------------------ UPI IDs
/** Words scammers put in payee names; a real business collects through a merchant ID, not a "refund desk". */
const STRONG_LURE = ["kyc", "refund", "cashback", "reversal", "prize", "lottery", "lucky", "winner", "jackpot", "helpdesk", "helpline", "customercare", "claim", "unlock", "verify", "verification"];
const WEAK_LURE = ["reward", "rewards", "bonus", "gift", "offer", "support", "care", "help", "service"];

function tokensOf(user: string): string[] {
  return user.toLowerCase().split(/[._\-\d]+/u).filter(Boolean);
}
function lureIn(user: string, tokens: string[], list: string[]): string | null {
  const low = user.toLowerCase();
  // substring match only for words that do not hide inside ordinary words ("kyc" never does; "care" does)
  return list.find((w) => tokens.includes(w) || ((w.length >= 5 || w === "kyc") && low.includes(w))) ?? null;
}
function brandIn(tokens: string[]): string | null {
  for (const [name, b] of Object.entries(RULES.brands)) {
    for (const k of b.keywords) {
      const kw = k.trim().toLowerCase().replace(/ /g, "");
      if (kw.length < 3) continue;
      const hit = tokens.some((tk) => tk === kw || (kw.length >= 4 && tk.includes(kw))
        || (tk.startsWith(kw) && STRONG_LURE.some((l) => tk.slice(kw.length).startsWith(l))));
      if (hit) return name;
    }
  }
  return null;
}

export function checkUpi(value: string): IdentifierCheck {
  const at = value.lastIndexOf("@");
  const user = value.slice(0, at), handle = value.slice(at + 1).toLowerCase();
  const tokens = tokensOf(user);
  const ind: Indicator[] = [];
  const add = (id: string, label: string, level: Level, detail: string) => ind.push({ id, label, level, detail });
  const brand = brandIn(tokens);
  const strong = lureIn(user, tokens, STRONG_LURE);
  const weak = strong ? null : lureIn(user, tokens, WEAK_LURE);
  const B = brand?.toUpperCase();
  if (brand && strong) add("brand_lure", "Brand name with a lure word", "high", `'${user}' combines ${B} with '${strong}'. Banks and companies don't collect refunds, KYC fees or prizes through UPI IDs like this.`);
  else if (strong) add("lure", "Lure word in the UPI ID", "medium", `'${strong}' in a payee address is typical of refund, KYC and prize scams. A real business collects through its own merchant ID.`);
  else if (brand) add("brand", `Uses the name '${B}'`, "low", "Anyone can put a brand name in a UPI ID. Check the payee name your UPI app shows before paying.");
  if (weak) add("weak_lure", "Promotional word in the UPI ID", "low", `'${weak}' is common in scam payee names, though some genuine merchants use it too.`);
  if (whole(UPI_RE, value)) add("handle", "Recognised UPI app handle", "info", `'@${handle}' is a common UPI app or bank handle. This says nothing about who owns the ID.`);
  else add("unknown_handle", "Unrecognised UPI handle", "medium", `'@${handle}' is not one of the UPI handles TEKMĒ knows. Check for a typo or an imitation of a real handle.`);
  if (/^(?:\+?91)?[6-9]\d{9}$/u.test(user)) add("mobile", "Linked to a mobile number", "info", "UPI IDs built from a phone number belong to individuals. That's normal for friends and family, unusual for a business.");
  ind.sort(byLevel);
  const warnings = ind.filter((i) => i.level === "high" || i.level === "medium");
  const verdict: IdentifierVerdict = warnings.length ? "SUSPICIOUS" : "UNVERIFIED";
  const summary = verdict === "SUSPICIOUS"
    ? `This UPI ID shows ${warnings.length} warning sign${warnings.length > 1 ? "s" : ""}; the strongest is: ${warnings[0].label.toLowerCase()}. Don't pay it until you know who owns it.`
    : "No red flags were found in this UPI ID. TEKMĒ works offline, so it cannot see who owns it: check the payee name your UPI app shows before you pay.";
  const steps = [
    ...(verdict === "SUSPICIOUS" ? ["Don't pay or approve any request from this UPI ID unless you can confirm who it belongs to."] : []),
    "You never need to enter your UPI PIN or scan a QR code to receive money.",
    "Before paying, check that the payee name in your UPI app matches who you expect.",
  ];
  return { kind: "upi", value, verdict, summary, indicators: ind, steps, url: null, analysed_at: new Date().toISOString() };
}

export function checkIdentifier(id: { kind: IdentifierKind; value: string }): IdentifierCheck {
  return id.kind === "url" ? checkUrl(id.value) : checkUpi(id.value);
}
