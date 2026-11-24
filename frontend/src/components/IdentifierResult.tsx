import { CircleAlert, CircleCheck, CircleHelp, IndianRupee, Info, Link2 } from "lucide-react";
import type { IdentifierCheck } from "../analysis/identifier";
import { Chip, levelLabel, levelTone } from "./ui";

const META = {
  url: {
    SUSPICIOUS: { label: "Suspicious link", tone: "scam", Icon: CircleAlert },
    OFFICIAL: { label: "Known official domain", tone: "safe", Icon: CircleCheck },
    UNVERIFIED: { label: "Can't verify this link", tone: "uncertain", Icon: CircleHelp },
  },
  upi: {
    SUSPICIOUS: { label: "Suspicious UPI ID", tone: "scam", Icon: CircleAlert },
    OFFICIAL: { label: "Known UPI ID", tone: "safe", Icon: CircleCheck },
    UNVERIFIED: { label: "Can't verify this UPI ID", tone: "uncertain", Icon: CircleHelp },
  },
} as const;
const BG = { scam: "border-scam/50 bg-scam-bg", safe: "border-safe/50 bg-safe-bg", uncertain: "border-uncertain/50 bg-uncertain-bg" };
const INK = { scam: "text-scam", safe: "text-safe", uncertain: "text-uncertain" };

/** Result of the rule-based link / UPI ID check. Deliberately different wording from the model's verdicts. */
export function IdentifierResult({ c, compact = false }: { c: IdentifierCheck; compact?: boolean }) {
  const m = META[c.kind][c.verdict];
  const KindIcon = c.kind === "url" ? Link2 : IndianRupee;
  const shown = compact ? c.indicators.slice(0, 4) : c.indicators;
  return (
    <div className="space-y-4">
      <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-4 py-3 ${BG[m.tone]}`} role="status" aria-live="polite">
        <m.Icon className={`h-7 w-7 shrink-0 ${INK[m.tone]}`} strokeWidth={2.2} aria-hidden />
        <span className={`font-display ${compact ? "text-[1.55rem]" : "text-[1.75rem]"} font-semibold leading-none ${INK[m.tone]}`}>{m.label}</span>
        <span className="ml-auto flex items-center gap-1.5 text-sm text-ink"><KindIcon className="h-4 w-4" aria-hidden />{c.kind === "url" ? "Link check" : "UPI ID check"}</span>
      </div>
      <div className="break-all rounded-lg border border-line bg-bg-2 px-3 py-2 font-mono text-xs text-ink">{c.value}</div>
      <p className="text-[0.95rem] leading-relaxed text-ink">{c.summary}</p>
      {shown.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-line">
          <table className="w-full text-left text-[0.84rem]">
            <caption className="sr-only">What the check found</caption>
            <tbody>
              {shown.map((i) => (
                <tr key={i.id} className="border-b border-line last:border-0">
                  <th scope="row" className="w-[36%] py-2.5 pl-3 pr-2 align-top font-medium text-ink">{i.label}</th>
                  <td className="py-2.5 pr-2 text-ink-2">{i.detail}</td>
                  <td className="py-2.5 pr-3 text-right align-top"><Chip tone={levelTone(i.level)}>{levelLabel(i.level)}</Chip></td>
                </tr>
              ))}
            </tbody>
          </table>
          {compact && c.indicators.length > shown.length && <div className="border-t border-line px-3 py-2 text-xs text-ink-3">+{c.indicators.length - shown.length} more in the full analysis</div>}
        </div>
      )}
      {!compact && (
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-3">What to do</div>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink">{c.steps.map((s) => <li key={s}>{s}</li>)}</ul>
        </div>
      )}
      <p className="flex gap-2 text-xs leading-relaxed text-ink-3">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          A single {c.kind === "url" ? "link" : "UPI ID"} was entered, so TEKMĒ ran its rule-based {c.kind === "url" ? "link" : "UPI"} check instead of the
          message model, which is trained on whole messages. Nothing was opened or looked up. Rules are evidence, not proof.
        </span>
      </p>
    </div>
  );
}
