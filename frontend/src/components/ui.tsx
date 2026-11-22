import type { ReactNode } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

export function Card({ title, icon, children, className = "", action }: { title?: ReactNode; icon?: ReactNode; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={`card p-5 ${className}`}>
      {title && (
        <header className="mb-4 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            {icon && <span className="text-accent">{icon}</span>}
            {title}
          </h2>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "scam" | "safe" | "warn" | "accent" | "info" }) {
  const tones: Record<string, string> = {
    neutral: "bg-surface-3 text-ink-2 border-line-2",
    scam: "bg-scam-bg text-scam border-scam/40",
    safe: "bg-safe-bg text-safe border-safe/40",
    warn: "bg-warn/10 text-warn border-warn/40",
    accent: "bg-accent/10 text-accent border-accent/40",
    info: "bg-series-1/10 text-[#8cb8f0] border-series-1/40",
  };
  return <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function Button({ children, onClick, disabled, variant = "primary", type = "button", title }: { children: ReactNode; onClick?: () => void; disabled?: boolean; variant?: "primary" | "ghost" | "outline"; type?: "button" | "submit"; title?: string }) {
  const v: Record<string, string> = {
    primary: "bg-accent-2 text-navy hover:bg-accent disabled:bg-surface-3 disabled:text-ink-3",
    outline: "border border-line-2 text-ink hover:bg-surface-3 disabled:text-ink-3",
    ghost: "text-ink-2 hover:text-ink hover:bg-surface-3 disabled:text-ink-3",
  };
  return (
    <button type={type} title={title} onClick={onClick} disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${v[variant]}`}>
      {children}
    </button>
  );
}

export function Spinner({ label }: { label: string }) {
  return <span className="inline-flex items-center gap-2 text-sm text-ink-2" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{label}</span>;
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-lg border border-scam/40 bg-scam-bg p-4 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-scam" aria-hidden />
      <div className="flex-1 text-ink">{message}</div>
      {onRetry && <button onClick={onRetry} className="text-sm font-semibold text-accent hover:underline">Retry</button>}
    </div>
  );
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <div className="rounded-full border border-line bg-surface-2 p-3 text-ink-3">{icon}</div>
      <p className="font-medium text-ink-2">{title}</p>
      {children && <p className="max-w-sm text-sm text-ink-3">{children}</p>}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "scam" | "safe" }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-ink-3">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${tone === "scam" ? "text-scam" : tone === "safe" ? "text-safe" : "text-ink"}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-3">{hint}</div>}
    </div>
  );
}

export const pct = (v: number | null | undefined, d = 1) => (v === null || v === undefined || Number.isNaN(v) ? "—" : `${(v * 100).toFixed(d)}%`);
/** Confidence display: never round a calibrated probability up to a claim of certainty. */
export const confPct = (v: number) => (v >= 0.995 ? ">99.5%" : v <= 0.005 ? "<0.5%" : pct(v));
