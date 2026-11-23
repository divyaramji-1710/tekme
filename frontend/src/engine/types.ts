import type { Preprocessed, Span } from "./preprocess";
import type { TacticHit } from "./tactics";
import type { Signal, UrlInfo } from "./trust";
import type { BenignReport } from "./benign";

export type Verdict = "SCAM" | "SAFE";
export type Category = "KYC_BANK" | "LOTTERY_PRIZE" | "LOAN_CREDIT" | "JOB_INVESTMENT" | "OTHER";
export interface Highlight { start: number; end: number; kind: "tactic" | "signal" | "benign" | "term"; label: string; text: string }
export interface KeyFactor { feature: string; label: string; contribution: number; direction: string }

export interface EngineOutput {
  pre: Preprocessed;
  tacticHits: TacticHit[];
  signals: Signal[];
  urlInfo: UrlInfo[];
  benign: BenignReport;
  features: Record<string, number>;
}

/** Same fields as the Python API's PredictResponse (backend/api/schemas.py). */
export interface CorePrediction {
  verdict: Verdict;
  category: Category | null;
  category_label: string | null;
  confidence: number;
  scam_probability: number;
  borderline: boolean;
  language: string;
  normalized_text: string;
  tactics: TacticHit[];
  risk_signals: Signal[];
  benign: Omit<BenignReport, "evidence"> & { evidence: Span[] };
  category_probabilities: Record<string, number> | null;
  obfuscation: Record<string, number>;
  explanation: string;
  confidence_interpretation: { level: string; text: string };
  key_factors: KeyFactor[];
  semantic_terms: { term: string; contribution: number }[];
  highlights: Highlight[];
  evidence_note: string;
  latency_ms: number;
}
export interface LightPrediction { verdict: Verdict; scam_probability: number; confidence: number; category: Category | null; borderline: boolean }
export type { Span, TacticHit, Signal, UrlInfo, BenignReport, Preprocessed };
