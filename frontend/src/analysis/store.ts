// Local persistence (this browser only). Nothing here is ever transmitted. History is OFF by default.
export type ThemePref = "dark" | "light" | "system";
export interface Settings {
  theme: ThemePref; lang: "en" | "hinglish"; textScale: 100 | 112 | 125; motion: "system" | "reduce" | "full";
  history: boolean; retentionDays: 1 | 7 | 30; redact: { phones: boolean; upi: boolean; urls: boolean; emails: boolean; numbers: boolean; amounts: boolean };
  highContrast: boolean;
}
export const DEFAULT_SETTINGS: Settings = {
  theme: "system", lang: "en", textScale: 100, motion: "system", history: false, retentionDays: 7,
  redact: { phones: true, upi: true, urls: true, emails: true, numbers: true, amounts: false }, highContrast: false,
};
export interface HistoryItem { id: string; at: string; text: string; verdict: string; display: string; category: string | null; confidence: number }
export interface FeedbackItem { id: string; at: string; text: string; predicted: string; scam_probability: number; user_label: "SCAM" | "SAFE"; correct: boolean; model_version: string; note?: string }

const K = { settings: "tekme:settings", history: "tekme:history", feedback: "tekme:feedback" };
const ls = (): Storage | null => { try { return typeof localStorage !== "undefined" ? localStorage : null; } catch { return null; } };
function read<T>(key: string, fallback: T): T {
  try { const v = ls()?.getItem(key); return v ? { ...(fallback as object), ...JSON.parse(v) } as T : fallback; } catch { return fallback; }
}
function readList<T>(key: string): T[] {
  try { const v = ls()?.getItem(key); const a = v ? JSON.parse(v) : []; return Array.isArray(a) ? a : []; } catch { return []; }
}
const write = (key: string, v: unknown) => { try { ls()?.setItem(key, JSON.stringify(v)); } catch { /* storage full or disabled */ } };
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

export const loadSettings = (): Settings => {
  const s = read<Settings>(K.settings, DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...s, redact: { ...DEFAULT_SETTINGS.redact, ...(s.redact ?? {}) } };
};
export const saveSettings = (s: Settings) => write(K.settings, s);

export function loadHistory(retentionDays: number): HistoryItem[] {
  const cutoff = Date.now() - retentionDays * 86400_000;
  const items = readList<HistoryItem>(K.history).filter((h) => Date.parse(h.at) >= cutoff);
  write(K.history, items);
  return items;
}
export function addHistory(item: Omit<HistoryItem, "id" | "at">, retentionDays: number): HistoryItem[] {
  const items = [{ ...item, id: uid(), at: new Date().toISOString() }, ...loadHistory(retentionDays)].slice(0, 200);
  write(K.history, items);
  return items;
}
export const clearHistory = () => ls()?.removeItem(K.history);

export const loadFeedback = (): FeedbackItem[] => readList<FeedbackItem>(K.feedback);
export function addFeedback(f: Omit<FeedbackItem, "id" | "at">): FeedbackItem[] {
  const items = [{ ...f, id: uid(), at: new Date().toISOString() }, ...loadFeedback()].slice(0, 1000);
  write(K.feedback, items);
  return items;
}
export const clearFeedback = () => ls()?.removeItem(K.feedback);

/** Everything TEKMĒ stores in this browser, for the privacy audit. */
export function storageAudit(): { key: string; bytes: number; items: number | null }[] {
  const s = ls();
  if (!s) return [];
  const out: { key: string; bytes: number; items: number | null }[] = [];
  for (let i = 0; i < s.length; i++) {
    const key = s.key(i)!;
    if (!key.startsWith("tekme:")) continue;
    const v = s.getItem(key) ?? "";
    let items: number | null = null;
    try { const p = JSON.parse(v); items = Array.isArray(p) ? p.length : null; } catch { /* not JSON */ }
    out.push({ key, bytes: new Blob([v]).size, items });
  }
  return out;
}
export function clearAll() {
  const s = ls();
  if (!s) return;
  for (const k of Object.keys(s)) if (k.startsWith("tekme:")) s.removeItem(k);
}
