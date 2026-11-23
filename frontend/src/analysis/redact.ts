// Privacy-safe export: replace personal identifiers using the engine's own entity detection.
import { preprocess } from "../engine/preprocess";
import { finditer } from "../engine/py";

export interface RedactOptions { phones: boolean; upi: boolean; urls: boolean; emails: boolean; numbers: boolean; amounts: boolean }
export const DEFAULT_REDACT: RedactOptions = { phones: true, upi: true, urls: true, emails: true, numbers: true, amounts: false };

export function redact(text: string, opt: RedactOptions = DEFAULT_REDACT): string {
  const pre = preprocess(text);
  const spans: { start: number; end: number; tag: string }[] = [];
  const add = (list: { start: number; end: number }[], tag: string, on: boolean) => { if (on) for (const s of list) spans.push({ ...s, tag }); };
  add(pre.urls, "[link]", opt.urls);
  add(pre.upi_ids, "[upi-id]", opt.upi);
  add(pre.emails, "[email]", opt.emails);
  add(pre.phones, "[phone]", opt.phones);
  add(pre.amounts, "[amount]", opt.amounts);
  add(pre.codes, "[code]", opt.numbers);
  if (opt.numbers) for (const m of finditer(/\p{Nd}{4,}/gu, text)) spans.push({ start: m.start, end: m.end, tag: "[number]" });
  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  let out = "", pos = 0;
  for (const s of spans) {
    if (s.start < pos) continue;
    out += text.slice(pos, s.start) + s.tag;
    pos = s.end;
  }
  return out + text.slice(pos);
}
