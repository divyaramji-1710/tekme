// The TEKMĒ Evidence Mark: two architectural bars joined by a central axis, with a single point of evidence
// at the centre. Original geometry; legible at 16 px because it uses only three solid shapes and one dot.

type Variant = "auto" | "dark" | "light" | "mono";
const COLORS: Record<Exclude<Variant, "auto" | "mono">, { mark: string; dot: string; hole: string }> = {
  dark: { mark: "#d39858", dot: "#eaceaa", hole: "#150c0c" },
  light: { mark: "#85431e", dot: "#34150f", hole: "#f7f3ee" },
};

export function EvidenceMark({ size = 40, variant = "auto", loading = false, title = "TEKMĒ" }: { size?: number; variant?: Variant; loading?: boolean; title?: string | null }) {
  const c = variant === "auto" ? { mark: "var(--t-accent)", dot: "var(--t-ink)", hole: "var(--t-bg)" }
    : variant === "mono" ? { mark: "currentColor", dot: "currentColor", hole: "transparent" } : COLORS[variant];
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role={title ? "img" : undefined} aria-label={title ?? undefined} aria-hidden={title ? undefined : true}>
      <g className={loading ? "mark-bar-top" : undefined}><rect x="5" y="9" width="54" height="9" rx="1.5" fill={c.mark} /></g>
      <g className={loading ? "mark-bar-bottom" : undefined}><rect x="5" y="46" width="54" height="9" rx="1.5" fill={c.mark} /></g>
      <rect x="27.5" y="18" width="9" height="28" fill={c.mark} />
      <circle cx="32" cy="32" r="8.5" fill={c.mark} />
      <circle cx="32" cy="32" r="5.6" fill={c.hole} />
      <circle cx="32" cy="32" r="3" fill={c.dot} className={loading ? "mark-pulse" : undefined} />
    </svg>
  );
}

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-3">
      <EvidenceMark size={compact ? 30 : 40} title={null} />
      <span className="font-brand text-[1.55rem] font-semibold leading-none text-ink sm:text-[1.8rem]" aria-label="TEKMĒ">TEKMĒ</span>
    </span>
  );
}

export function MarkLoader({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center gap-3 py-10 text-sm text-ink-2">
      <EvidenceMark size={52} loading title={null} />
      <span>{label}</span>
    </div>
  );
}
