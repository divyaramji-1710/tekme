// Hinglish rendering of the explanation. It follows the same decision structure as the English explainer
// (engine/explain.ts) and uses only fixed, locally stored phrase translations.
import type { CorePrediction } from "../engine/types";

const TACTIC: Record<string, string> = {
  urgency: "aapko jaldi karne ka dabaav daalta hai",
  threat: "block, jurmana ya kanooni karvai ki dhamki deta hai",
  authority: "bank, brand ya sarkari sanstha ka naam lekar kuch karne ko kehta hai",
  reward: "bina maange inaam ya reward ka vaada karta hai",
  sensitive_info: "OTP, PIN ya card number jaisi gopniya jaankari maangta hai",
  payment: "pehle se fee ya payment maangta hai",
  link: "link kholne ya app install karne ko kehta hai",
  job_investment: "aasaan kamai ya guaranteed munafe ka laalach deta hai",
  emotional: "emergency, parivaar ya pyaar ke naam par emotional dabaav banata hai",
  secrecy: "baat chhupane ko kehta hai",
};
const SIGNAL: Record<string, string> = {
  lookalike_domain: "nakli (look-alike) domain ka link deta hai",
  brand_domain_mismatch: "aise domain ka link deta hai jo us brand ka nahi hai",
  shortened_link: "short link ke peeche asli address chhupata hai",
  ip_link: "seedhe IP address ka link deta hai",
  suspicious_tld: "asaamaanya domain ending istemaal karta hai",
  punycode: "punycode domain istemaal karta hai",
  at_in_url: "link ke andar '@' ka dhokha istemaal karta hai",
  obfuscation: "filter se bachne ke liye chhupe hue akshar istemaal karta hai",
  messaging_app: "baat WhatsApp ya Telegram par le jaata hai",
  defanged_link: "link ko chhupe hue format mein likhta hai",
};
const CATEGORY: Record<string, string> = {
  KYC_BANK: "KYC / Bank", LOTTERY_PRIZE: "Lottery / Inaam", LOAN_CREDIT: "Loan / Credit", JOB_INVESTMENT: "Naukri / Nivesh",
};
const TEMPLATE: Record<string, string> = {
  otp_notification: "aam OTP / verification code ki soochna",
  transaction_alert: "bank / wallet transaction alert",
  delivery_update: "order / delivery ki jaankari",
  reminder: "appointment, bill ya class ka reminder",
  personal_chat: "aam niji baatcheet",
};
const join = (xs: string[]) => (xs.length <= 1 ? xs.join("") : xs.slice(0, -1).join(", ") + " aur " + xs[xs.length - 1]);
const order: Record<string, number> = { strong: 0, moderate: 1, weak: 2 };

export function explainHinglish(p: CorePrediction): string {
  const hits = [...p.tactics].sort((a, b) => order[a.strength] - order[b.strength]);
  const sids = [...new Set(p.risk_signals.map((s) => s.id))];
  const out: string[] = [];
  if (p.verdict === "SCAM") {
    const ids = sids.includes("lookalike_domain") ? sids.filter((s) => s !== "brand_domain_mismatch") : sids;
    const parts = [...hits.slice(0, 3).map((h) => TACTIC[h.id]), ...ids.filter((s) => SIGNAL[s]).map((s) => SIGNAL[s]).slice(0, 2)];
    if (p.benign.conflict) out.push("Yeh aam soochna jaisa dikhta hai, lekin isme khatarnaak nirdesh bhi hai - yeh aam scam tareeka hai.");
    out.push(parts.length ? `Yeh message ${join(parts)}.` : "Koi ek saaf tareeka nahi dikha, lekin shabd training data ke scam messages se kaafi milte hain.");
    if (p.category && p.category !== "OTHER") out.push(`Iski baatein ${CATEGORY[p.category]} scam pattern se milti hain.`);
    out.push("Is message ke link, number ya code par bharosa mat kijiye; company ke official app ya website se sampark kijiye.");
  } else {
    const t = p.benign.templates.find((x) => x !== "safety_advice");
    out.push(t && TEMPLATE[t] ? `Yeh message ${TEMPLATE[t]} jaisa lagta hai.` : "Iske shabd aam, asli messages jaise hain.");
    if (p.benign.safety_advice && (p.benign.templates.includes("otp_notification") || sids.includes("otp_mention")))
      out.push("Isme suraksha salaah hai aur yeh code share karne ko nahi kehta.");
    out.push(hits.length ? "Kuch sanket mile, lekin kul milakar sabooth asli message ki taraf ishaara karte hain." : "Koi manipulation tareeka nahi mila.");
    const risky = sids.filter((s) => SIGNAL[s]).map((s) => SIGNAL[s]);
    if (risky.length) out.push(`Dhyaan dein: yeh ${join(risky.slice(0, 2))}, isliye saavdhaan rahiye.`);
  }
  if (p.borderline) out.push("Sabooth mile-jule hain aur score decision seema ke kareeb hai; official channel se verify kijiye.");
  return out.join(" ");
}
