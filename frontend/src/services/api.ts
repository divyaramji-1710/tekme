// Typed client for the local SCAMPRINT API. Every request goes to the same
// origin (/api), which is either the Vite dev proxy or the FastAPI server itself.

export type Verdict = "SCAM" | "SAFE";
export type Category = "KYC_BANK" | "LOTTERY_PRIZE" | "LOAN_CREDIT" | "JOB_INVESTMENT" | "OTHER";

export interface Span { text: string; start: number; end: number }
export interface Tactic { id: string; label: string; description: string; strength: "weak" | "moderate" | "strong"; rationale: string; evidence: Span[] }
export interface RiskSignal { id: string; label: string; severity: "info" | "low" | "medium" | "high"; detail: string; evidence: Span[] }
export interface Highlight { start: number; end: number; kind: "tactic" | "signal" | "benign" | "term"; label: string; text: string }
export interface KeyFactor { feature: string; label: string; contribution: number; direction: string }

export interface Prediction {
  verdict: Verdict;
  category: Category | null;
  category_label: string | null;
  confidence: number;
  scam_probability: number;
  borderline: boolean;
  language: string;
  normalized_text: string;
  tactics: Tactic[];
  risk_signals: RiskSignal[];
  benign: { templates: string[]; descriptions: string[]; safety_advice: boolean; personal_chat: boolean; conflict: boolean; conflict_reasons: string[] };
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

export interface MutationVariant { type: string; description: string; text: string; changed: boolean; verdict: Verdict; confidence: number; scam_probability: number; category: string | null; verdict_changed: boolean }
export interface MutationEval {
  original: { text: string; verdict: Verdict; confidence: number; scam_probability: number; category: string | null };
  variants: MutationVariant[];
  summary: { n_variants: number; n_changed_text: number; consistency: number; verdict_flips: number; mean_confidence: number; min_scam_probability: number; max_scam_probability: number; accuracy_vs_expected: number | null; metric_note: string };
}
export interface MutationType { id: string; description: string; used_in_training_augmentation: boolean }
export interface Example { id: string; group: string; title: string; text: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Metrics = Record<string, any>;

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

const BASE = "/api";

async function request<T>(path: string, init?: RequestInit, timeoutMs = 20000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(BASE + path, { ...init, signal: ctrl.signal, headers: { "Content-Type": "application/json" } });
    if (!res.ok) {
      let msg = `Request failed (${res.status})`;
      try {
        const body = await res.json();
        if (typeof body.detail === "string") msg = body.detail;
        if (Array.isArray(body.errors) && body.errors[0]?.msg) msg = body.errors[0].msg;
      } catch { /* not JSON */ }
      throw new ApiError(res.status, msg);
    }
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if ((e as Error).name === "AbortError") throw new ApiError(0, "The local backend did not respond in time.");
    throw new ApiError(0, "Cannot reach the local SCAMPRINT backend on 127.0.0.1:8000. Is it running?");
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  health: () => request<{ status: string; model_loaded: boolean; model_version: string | null; error: string | null }>("/health", undefined, 4000),
  info: () => request<Metrics>("/model/info"),
  predict: (text: string) => request<Prediction>("/predict", { method: "POST", body: JSON.stringify({ text }) }),
  mutationTypes: () => request<{ types: MutationType[] }>("/mutation-types"),
  evaluateMutations: (text: string, types: string[] | null, expected_label: Verdict | null, variants_per_type = 1) =>
    request<MutationEval>("/evaluate-mutations", { method: "POST", body: JSON.stringify({ text, types, expected_label, variants_per_type }) }),
  metrics: () => request<Metrics>("/metrics"),
  privacy: () => request<Metrics>("/privacy/status"),
  examples: () => request<{ examples: Example[] }>("/examples"),
};

export const CATEGORY_LABELS: Record<Category, string> = {
  KYC_BANK: "KYC / Bank", LOTTERY_PRIZE: "Lottery / Prize", LOAN_CREDIT: "Loan / Credit", JOB_INVESTMENT: "Job / Investment", OTHER: "Other",
};
export const LANGUAGE_LABELS: Record<string, string> = { en: "English", hinglish: "Hinglish", hi: "Hindi (Devanagari)", regional_mixed: "Regional code-mixed" };
export const MAX_CHARS = 2000;
