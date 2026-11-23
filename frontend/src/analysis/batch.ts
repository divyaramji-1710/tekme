// Batch scanning: local CSV / text import, chunked on-device classification, summary and export.
import type { Engine } from "../engine/engine";
import { redact, type RedactOptions } from "./redact";

export interface BatchRow { id: number; text: string; label: "SCAM" | "SAFE" | null }
export interface BatchResult extends BatchRow { verdict: "SCAM" | "SAFE"; scam_probability: number; confidence: number; category: string | null; borderline: boolean; tactics: string[]; ms: number }

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(src: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"' && field === "") q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

const LABELS: Record<string, "SCAM" | "SAFE"> = { scam: "SCAM", spam: "SCAM", fraud: "SCAM", "1": "SCAM", safe: "SAFE", ham: "SAFE", legit: "SAFE", genuine: "SAFE", "0": "SAFE" };

/** CSV with a text/message column (optional label column) or plain text with one message per line. */
export function parseBatch(name: string, content: string, maxRows = 5000): { rows: BatchRow[]; format: string; truncated: boolean } {
  let rows: BatchRow[] = [];
  let format = "text lines";
  if (/\.csv$/i.test(name) || /^[^\n]*,(?:[^\n]*)\n/.test(content.slice(0, 2000)) && /text|message|sms|body/i.test(content.split("\n")[0])) {
    const t = parseCsv(content);
    const header = (t[0] ?? []).map((h) => h.trim().toLowerCase());
    let ti = header.findIndex((h) => ["text", "message", "sms", "body", "content"].includes(h));
    const li = header.findIndex((h) => ["label", "binary_label", "class", "category", "verdict"].includes(h));
    const hasHeader = ti >= 0 || li >= 0;
    if (ti < 0) ti = 0;
    rows = t.slice(hasHeader ? 1 : 0).map((r, i) => ({ id: i + 1, text: (r[ti] ?? "").trim(), label: li >= 0 ? LABELS[(r[li] ?? "").trim().toLowerCase()] ?? null : null }));
    format = "CSV";
  } else {
    rows = content.split(/\r?\n/).map((l, i) => ({ id: i + 1, text: l.trim(), label: null as BatchRow["label"] }));
  }
  rows = rows.filter((r) => r.text);
  const truncated = rows.length > maxRows;
  return { rows: rows.slice(0, maxRows).map((r, i) => ({ ...r, id: i + 1, text: r.text.slice(0, 2000) })), format, truncated };
}

export async function runBatch(engine: Engine, rows: BatchRow[], onProgress: (done: number) => void, signal?: { cancelled: boolean }): Promise<BatchResult[]> {
  const out: BatchResult[] = [];
  const now = () => performance.now();
  for (let i = 0; i < rows.length; i++) {
    if (signal?.cancelled) break;
    const t0 = now();
    const p = engine.predictLight(rows[i].text);
    out.push({ ...rows[i], verdict: p.verdict, scam_probability: p.scam_probability, confidence: p.confidence, category: p.category, borderline: p.borderline, tactics: p.out.tacticHits.map((h) => h.id), ms: now() - t0 });
    if (i % 10 === 9 || i === rows.length - 1) { onProgress(i + 1); await new Promise((r) => setTimeout(r, 0)); }
  }
  return out;
}

export function summarise(rs: BatchResult[]) {
  const n = rs.length;
  const scam = rs.filter((r) => r.verdict === "SCAM").length;
  const labelled = rs.filter((r) => r.label);
  const tp = labelled.filter((r) => r.label === "SCAM" && r.verdict === "SCAM").length;
  const fp = labelled.filter((r) => r.label === "SAFE" && r.verdict === "SCAM").length;
  const fn = labelled.filter((r) => r.label === "SCAM" && r.verdict === "SAFE").length;
  const tn = labelled.filter((r) => r.label === "SAFE" && r.verdict === "SAFE").length;
  const cats: Record<string, number> = {};
  for (const r of rs) if (r.category) cats[r.category] = (cats[r.category] ?? 0) + 1;
  const ms = rs.map((r) => r.ms).sort((a, b) => a - b);
  return {
    n, scam, safe: n - scam, borderline: rs.filter((r) => r.borderline).length, categories: cats,
    labelled: labelled.length ? { n: labelled.length, accuracy: (tp + tn) / labelled.length, precision: tp + fp ? tp / (tp + fp) : null, recall: tp + fn ? tp / (tp + fn) : null, false_positive_rate: fp + tn ? fp / (fp + tn) : null, tp, fp, fn, tn } : null,
    median_ms: ms.length ? ms[Math.floor(ms.length / 2)] : 0,
  };
}

const csvCell = (v: unknown) => { const s = v === null || v === undefined ? "" : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function toCsv(rs: BatchResult[], opt: RedactOptions | null): string {
  const head = ["id", "text", "label", "verdict", "scam_probability", "confidence", "category", "borderline", "tactics"];
  const lines = rs.map((r) => [r.id, opt ? redact(r.text, opt) : r.text, r.label ?? "", r.verdict, r.scam_probability.toFixed(4), r.confidence.toFixed(4), r.category ?? "", r.borderline, r.tactics.join("|")].map(csvCell).join(","));
  return [head.join(","), ...lines].join("\r\n");
}
export function download(name: string, content: string, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
