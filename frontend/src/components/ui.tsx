import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, CircleHelp, Info, TriangleAlert } from "lucide-react";
import { MarkLoader } from "../brand/EvidenceMark";

export function Panel({ title, icon, children, className = "", action, id, as = "section" }: {
  title?: ReactNode; icon?: ReactNode; children: ReactNode; className?: string; action?: ReactNode; id?: string; as?: "section" | "div";
}) {
  const Tag = as;
  return (
    <Tag id={id} className={`panel p-5 sm:p-6 ${className}`}>
      {title && (
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2.5 font-display text-[1.6rem] font-semibold leading-tight text-ink">
            {icon && <span className="text-accent">{icon}</span>}{title}
          </h2>
          {action}
        </header>
      )}
      {children}
    </Tag>
  );
}

export type Tone = "neutral" | "scam" | "safe" | "uncertain" | "warn" | "info" | "accent";
const TONES: Record<Tone, string> = {
  neutral: "border-line-2 bg-surface-2 text-ink-2",
  scam: "border-scam/40 bg-scam-bg text-scam",
  safe: "border-safe/40 bg-safe-bg text-safe",
  uncertain: "border-uncertain/40 bg-uncertain-bg text-uncertain",
  warn: "border-warn/40 bg-warn-bg text-warn",
  info: "border-info/40 bg-info-bg text-info",
  accent: "border-accent/40 bg-accent-soft text-accent",
};
export function Chip({ children, tone = "neutral", className = "" }: { children: ReactNode; tone?: Tone; className?: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold ${TONES[tone]} ${className}`}>{children}</span>;
}
export const levelTone = (l: string): Tone => (l === "high" ? "scam" : l === "medium" ? "warn" : l === "low" ? "info" : "neutral");
export const levelLabel = (l: string) => (l === "high" ? "High" : l === "medium" ? "Medium" : l === "low" ? "Low" : "Info");

export function Button({ children, onClick, disabled, variant = "primary", type = "button", className = "", ariaLabel }: {
  children: ReactNode; onClick?: () => void; disabled?: boolean; variant?: "primary" | "analyze" | "outline" | "ghost" | "tab" | "tab-active";
  type?: "button" | "submit"; className?: string; ariaLabel?: string;
}) {
  const v: Record<string, string> = {
    primary: "btn-primary rounded-[10px] px-5 py-2.5",
    analyze: "btn-analyze rounded-[10px] px-5 py-2.5 text-[1rem]",
    outline: "rounded-[10px] border border-line-2 px-4 py-2.5 text-ink hover:bg-surface-2 disabled:opacity-50",
    ghost: "rounded-[10px] px-3 py-2 text-ink-2 hover:bg-surface-2 hover:text-ink disabled:opacity-50",
    tab: "rounded-[9px] border border-line-2 px-3.5 py-2 text-ink hover:bg-surface-2",
    "tab-active": "rounded-[9px] border border-transparent px-3.5 py-2 btn-analyze",
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} aria-label={ariaLabel}
      className={`inline-flex items-center justify-center gap-2 text-sm font-semibold transition-[filter,background-color] disabled:cursor-not-allowed ${v[variant]} ${className}`}>
      {children}
    </button>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-scam/40 bg-scam-bg p-4 text-sm">
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-scam" aria-hidden />
      <div className="flex-1 text-ink">{message}</div>
      {onRetry && <button onClick={onRetry} className="text-sm font-semibold text-accent hover:underline">Retry</button>}
    </div>
  );
}
export function Note({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" | "uncertain" }) {
  const Icon = tone === "warn" ? TriangleAlert : tone === "uncertain" ? CircleHelp : Info;
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border p-3.5 text-[0.86rem] leading-relaxed ${TONES[tone]}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><div className="text-ink">{children}</div>
    </div>
  );
}
export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <div className="rounded-full border border-line bg-surface-2 p-3 text-ink-3">{icon}</div>
      <p className="font-semibold text-ink-2">{title}</p>
      {children && <p className="max-w-sm text-sm text-ink-3">{children}</p>}
    </div>
  );
}
export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "scam" | "safe" }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-4">
      <div className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-3">{label}</div>
      <div className={`mt-1 font-display text-[1.9rem] font-semibold leading-none tabular-nums ${tone === "scam" ? "text-scam" : tone === "safe" ? "text-safe" : "text-ink"}`}>{value}</div>
      {hint && <div className="mt-1.5 text-xs text-ink-3">{hint}</div>}
    </div>
  );
}
export type BuildStatus = "available" | "partial" | "in_development" | "not_verified" | "not_active" | "planned";
const STATUS: Record<BuildStatus, [string, Tone, typeof CircleCheck]> = {
  available: ["Available · tested", "safe", CircleCheck],
  partial: ["Partial", "warn", TriangleAlert],
  in_development: ["In development", "info", Info],
  not_verified: ["Not verified", "uncertain", CircleHelp],
  not_active: ["Not active", "neutral", CircleAlert],
  planned: ["Planned", "neutral", Info],
};
export function StatusChip({ status }: { status: BuildStatus }) {
  const [label, tone, Icon] = STATUS[status];
  return <Chip tone={tone}><Icon className="h-3.5 w-3.5" aria-hidden />{label}</Chip>;
}
export function EngineGate({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
export const Loading = MarkLoader;
export const pct = (v: number | null | undefined, d = 1) => (v === null || v === undefined || Number.isNaN(v) ? "—" : `${(v * 100).toFixed(d)}%`);
/** Never round a calibrated probability up to a claim of certainty. */
export const confPct = (v: number) => (v >= 0.995 ? ">99.5%" : v <= 0.005 ? "<0.5%" : pct(v));
export const num = (v: number | null | undefined, d = 3) => (v === null || v === undefined ? "—" : v.toFixed(d));
