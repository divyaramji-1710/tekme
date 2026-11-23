// The shared analysis contract. Every page renders an `Analysis` produced here from the on-device engine.
import type { Engine } from "../engine/engine";
import type { CorePrediction } from "../engine/types";
import { explainHinglish } from "./explainHinglish";
import { impersonation, paymentForensics, senderForensics, urlForensics, type BrandClaim, type Indicator, type PaymentForensics, type UrlForensics } from "./forensics";
import { guidance, type Guidance, type Lang, type Tier } from "./guidance";
import { familiarity, type Familiarity, type Intel } from "./intel";

export type DisplayVerdict = "SCAM" | "SAFE" | "UNCERTAIN";
/** Unfamiliar messages below this confidence are shown as UNCERTAIN. The unfamiliarity flag detects distribution
 *  shift (19% of external Test B vs 10% of test) but barely predicts errors (test accuracy 94.3% flagged vs 95.1%),
 *  so it only downgrades already-moderate verdicts (DECISIONS.md D24). */
export const UNFAMILIAR_CONFIDENCE_FLOOR = 0.75;

export interface Uncertainty { display_verdict: DisplayVerdict; tier: Tier; reasons: string[]; borderline: boolean; unfamiliar: boolean }
export interface Analysis {
  input: { text: string; sender: string | null; chars: number };
  core: Omit<CorePrediction, never>;
  uncertainty: Uncertainty;
  familiarity: Familiarity | null;
  urls: UrlForensics[];
  payment: PaymentForensics;
  brands: BrandClaim[];
  sender: Indicator[];
  guidance: Guidance;
  explanation_hinglish: string;
  model_version: string;
  analysed_at: string;
}

export function analyse(engine: Engine, intel: Intel | null, text: string, opts: { sender?: string; lang: Lang }): Analysis {
  const p = engine.predict(text);
  const { _row, _out, ...core } = p;
  void _row;
  const fam = intel ? familiarity(engine, intel, _out.pre.model_text) : null;
  const reasons: string[] = [];
  if (core.borderline) reasons.push("The calibrated probability is close to the 50% decision threshold.");
  if (fam?.unfamiliar) reasons.push("The message is unlike the training data (" + fam.reasons.join("; ") + "), so the score may be less reliable.");
  const uncertain = core.borderline || (!!fam?.unfamiliar && core.confidence < UNFAMILIAR_CONFIDENCE_FLOOR);
  const tier: Tier = uncertain ? "uncertain"
    : core.verdict === "SCAM" ? (core.confidence >= 0.9 ? "scam_high" : "scam")
      : core.risk_signals.some((s) => ["medium", "high"].includes(s.severity)) || core.tactics.length ? "safe_caution" : "safe";
  const pay = paymentForensics(_out);
  const urls = _out.pre.urls.map((u) => urlForensics(u.text));
  const evidenceIds = [
    ...(_out.features.otp_share_request ? ["otp_share"] : []),
    ...pay.indicators.map((i) => i.id),
    ...(urls.some((u) => u.indicators.some((i) => i.id === "lookalike" || i.id === "brand_subdomain")) ? ["lookalike"] : []),
    ...(_out.features.messaging_app ? ["messaging_app"] : []),
    ...(core.verdict === "SCAM" && _out.features.call_request ? ["call_request"] : []),
    ...core.tactics.filter((t) => t.id === "secrecy" || t.id === "emotional").map((t) => t.id),
  ];
  return {
    input: { text, sender: opts.sender?.trim() || null, chars: text.length },
    core,
    uncertainty: { display_verdict: uncertain ? "UNCERTAIN" : core.verdict, tier, reasons, borderline: core.borderline, unfamiliar: !!fam?.unfamiliar },
    familiarity: fam,
    urls,
    payment: pay,
    brands: impersonation(_out),
    sender: senderForensics(opts.sender ?? ""),
    guidance: guidance({ tier, category: core.category, evidenceIds, lang: opts.lang }),
    explanation_hinglish: explainHinglish(core),
    model_version: engine.manifest.model_version,
    analysed_at: new Date().toISOString(),
  };
}
