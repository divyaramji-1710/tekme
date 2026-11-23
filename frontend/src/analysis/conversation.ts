// Conversation intelligence: per-turn on-device analysis plus a rule-based view of how the conversation
// escalates. The underlying model was trained on single messages; the conversation-level risk below is a
// documented aggregation rule, not a separately trained conversation model.
import type { Engine } from "../engine/engine";
import type { Verdict } from "../engine/types";

export type Stage = "rapport" | "authority" | "lure" | "link" | "pressure" | "payment" | "credential";
export const STAGE_INFO: Record<Stage, { label: string; rank: number; description: string }> = {
  rapport: { label: "Rapport / ordinary", rank: 0, description: "Greeting or ordinary content with no manipulation cue." },
  authority: { label: "Authority claim", rank: 1, description: "Invokes a bank, brand, official or relative." },
  lure: { label: "Lure", rank: 1, description: "Prize, easy income, investment returns or an emotional hook." },
  link: { label: "Link / channel push", rank: 2, description: "Pushes a link, app, call or a move to WhatsApp / Telegram." },
  pressure: { label: "Pressure", rank: 2, description: "Urgency, threats or requests for secrecy." },
  payment: { label: "Payment request", rank: 3, description: "Asks for a fee, transfer, collect approval or QR scan." },
  credential: { label: "Credential harvesting", rank: 3, description: "Asks for an OTP, PIN, password or card details." },
};

export interface Turn { speaker: "them" | "me"; text: string }
export interface TurnResult extends Turn {
  index: number; verdict: Verdict | null; scam_probability: number | null; stages: Stage[]; top_stage: Stage; tactics: string[];
}
export interface ConversationResult {
  turns: TurnResult[]; escalation: boolean; escalation_path: Stage[]; risk: "high" | "elevated" | "low";
  peak_probability: number; combined: { verdict: Verdict; scam_probability: number }; reasons: string[]; note: string;
}

/** Parse "Name: text" lines; lines starting with "me:"/"you:" are the user's own turns. Blank lines separate turns. */
export function parseConversation(raw: string): Turn[] {
  const turns: Turn[] = [];
  for (const block of raw.split(/\n+/)) {
    const line = block.trim();
    if (!line) continue;
    const m = /^([^:]{1,24}):\s*(.*)$/s.exec(line);
    if (m && !/^https?$/i.test(m[1])) {
      const who = m[1].trim().toLowerCase();
      turns.push({ speaker: ["me", "you", "i", "self", "main"].includes(who) ? "me" : "them", text: m[2] });
    } else turns.push({ speaker: "them", text: line });
  }
  return turns.filter((t) => t.text.trim());
}

export function analyseConversation(engine: Engine, turns: Turn[]): ConversationResult {
  const results: TurnResult[] = turns.map((t, index) => {
    if (t.speaker === "me") return { ...t, index, verdict: null, scam_probability: null, stages: ["rapport"], top_stage: "rapport", tactics: [] };
    const p = engine.predictLight(t.text, false);
    const ids = new Set(p.out.tacticHits.map((h) => h.id));
    const f = p.out.features;
    const st: Stage[] = [];
    if (ids.has("sensitive_info") || f.otp_share_request) st.push("credential");
    if (ids.has("payment")) st.push("payment");
    if (ids.has("urgency") || ids.has("threat") || ids.has("secrecy")) st.push("pressure");
    if (ids.has("link") || f.messaging_app || f.call_request || f.has_url) st.push("link");
    if (ids.has("reward") || ids.has("job_investment") || ids.has("emotional")) st.push("lure");
    if (ids.has("authority") || f.brand_mentioned) st.push("authority");
    if (!st.length) st.push("rapport");
    const top = st.reduce((a, b) => (STAGE_INFO[b].rank > STAGE_INFO[a].rank ? b : a));
    return { ...t, index, verdict: p.verdict, scam_probability: p.scam_probability, stages: st, top_stage: top, tactics: [...ids] };
  });
  const incoming = results.filter((r) => r.speaker === "them");
  const ranks = incoming.map((r) => STAGE_INFO[r.top_stage].rank);
  // Escalation: a later incoming turn reaches a higher stage rank than any earlier one, ending at rank >= 2.
  let escalation = false;
  let best = -1;
  const path: Stage[] = [];
  incoming.forEach((r, i) => {
    if (STAGE_INFO[r.top_stage].rank > best) { if (i > 0) escalation = true; best = STAGE_INFO[r.top_stage].rank; path.push(r.top_stage); }
  });
  escalation = escalation && best >= 2 && incoming.length >= 2;
  const peak = Math.max(0, ...incoming.map((r) => r.scam_probability ?? 0));
  const combinedText = incoming.map((r) => r.text).join("\n");
  const c = combinedText ? engine.predictLight(combinedText, false) : null;
  const reasons: string[] = [];
  const scamTurns = incoming.filter((r) => r.verdict === "SCAM").length;
  if (scamTurns) reasons.push(`${scamTurns} of ${incoming.length} incoming message${incoming.length > 1 ? "s were" : " was"} classified as SCAM.`);
  if (escalation) reasons.push(`The conversation escalates: ${path.map((s) => STAGE_INFO[s].label.toLowerCase()).join(" → ")}.`);
  if (incoming.some((r) => r.stages.includes("credential"))) reasons.push("Someone asks for an OTP, PIN or account details.");
  if (incoming.some((r) => r.stages.includes("payment"))) reasons.push("Someone asks for money or a payment approval.");
  const risk: ConversationResult["risk"] = peak >= 0.9 || (escalation && Math.max(...ranks, 0) >= 3) ? "high"
    : peak >= 0.5 || escalation || (c && c.verdict === "SCAM") ? "elevated" : "low";
  if (!reasons.length) reasons.push("No incoming message was classified as a scam and no escalation pattern was found.");
  return {
    turns: results, escalation, escalation_path: path, risk, peak_probability: peak,
    combined: c ? { verdict: c.verdict, scam_probability: c.scam_probability } : { verdict: "SAFE", scam_probability: 0 },
    reasons,
    note: "Each incoming turn is scored by the same on-device model. The conversation risk combines those scores with a fixed escalation rule; the model itself was trained on single messages, not whole conversations.",
  };
}
