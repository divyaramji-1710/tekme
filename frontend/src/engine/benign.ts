// Port of backend/engines/benign_protection.py (legitimate-message protection, rule part).
import { RULES } from "./rules";
import { cpBefore, cpAfter, cpLen, cps, finditer, rx, search, test, type M } from "./py";
import { span, type Preprocessed, type Span } from "./preprocess";
import type { TacticHit } from "./tactics";

export interface BenignReport {
  templates: string[]; descriptions: string[]; safety_advice: boolean; personal_chat: boolean;
  conflict: boolean; conflict_reasons: string[]; evidence: Span[];
}
const B = RULES.benign;

function otpShareRequest(text: string): M | null {
  for (const m of finditer(rx(B.OTP_SHARE_RE), text)) {
    const before = cpBefore(text, m.start, 35);
    if (test(rx(B.NEG_BEFORE), before) || test(rx(B.NEG_BEFORE), cps(m.text).slice(0, 20).join(""))) continue;
    if (test(rx(B.SANCTIONED_SHARE), text.slice(m.start, m.end) + cpAfter(text, m.end, 50))) continue;
    return m;
  }
  return null;
}

export function analyse(pre: Preprocessed, hits: TacticHit[], tf: Record<string, number>): { report: BenignReport; feats: Record<string, number> } {
  const text = pre.normalized;
  const rep: BenignReport = { templates: [], descriptions: [], safety_advice: false, personal_chat: false, conflict: false, conflict_reasons: [], evidence: [] };
  const codesPresent = pre.codes.length > 0 || (pre.placeholders["number"] ?? 0) > 0;
  for (const [tid, { description, patterns }] of Object.entries(B.TEMPLATES)) {
    const matches = patterns.flatMap((p) => finditer(rx(p), text));
    const groups = patterns.filter((p) => test(rx(p), text)).length;
    let ok = false;
    if (tid === "otp_notification") ok = groups >= 1 && codesPresent && test(rx(B.OTP_WORD), text);
    else if (tid === "safety_advice") ok = groups >= 1;
    else if (tid === "transaction_alert") ok = groups >= 2 || (groups >= 1 && pre.amounts.length > 0);
    else if (tid === "delivery_update" || tid === "reminder") ok = groups >= 2;
    if (ok) {
      if (tid === "safety_advice") rep.safety_advice = true;
      rep.templates.push(tid);
      rep.descriptions.push(description);
      rep.evidence.push(...matches.slice(0, 2).map((m) => span(pre, m.start, m.end)));
    }
  }
  const noStruct = !(tf.has_url || tf.has_phone || tf.has_money || tf.brand_mentioned || tf.has_upi);
  if (noStruct && cpLen(pre.original) <= 200 && test(rx(B.CHAT_RE), text) && !hits.length) {
    rep.personal_chat = true;
    rep.templates.push("personal_chat");
    rep.descriptions.push("Reads like an ordinary personal conversation");
  }
  const active = new Set(hits.map((h) => h.id));
  const share = otpShareRequest(text);
  const shell = rep.templates.some((t) => ["otp_notification", "transaction_alert", "delivery_update", "safety_advice"].includes(t));
  if (share) {
    rep.conflict_reasons.push("asks for an OTP/PIN/code to be shared with someone");
    rep.evidence.push(span(pre, share.start, share.end));
  }
  if (shell && active.has("sensitive_info")) rep.conflict_reasons.push("routine-looking notification that also requests sensitive details");
  if (shell && active.has("payment")) rep.conflict_reasons.push("routine-looking notification that also demands a payment");
  if (shell && active.has("threat") && (tf.url_lookalike || tf.brand_domain_mismatch || tf.url_shortener || tf.url_suspicious_tld))
    rep.conflict_reasons.push("threatening notification pointing to an unofficial link");
  rep.conflict = rep.conflict_reasons.length > 0;
  const feats = {
    benign_otp_notification: +rep.templates.includes("otp_notification"),
    benign_safety_advice: +rep.safety_advice,
    benign_transaction_alert: +rep.templates.includes("transaction_alert"),
    benign_delivery_update: +rep.templates.includes("delivery_update"),
    benign_reminder: +rep.templates.includes("reminder"),
    benign_personal_chat: +rep.personal_chat,
    benign_template_count: rep.templates.filter((t) => t !== "safety_advice").length,
    benign_conflict: +rep.conflict,
    otp_share_request: +(share !== null),
  };
  return { report: rep, feats };
}
export { search };
