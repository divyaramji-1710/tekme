import { useState } from "react";

// Hand-built SVG charts: no chart library, no remote assets. Colours validated
// (dataviz validator, dark mode, surface #111a2e): series-1 #3987e5, series-2 #d95926.
const S1 = "#3987e5";
const GRID = "#24314d";
const INK2 = "#a9b4c7";
const INK3 = "#7c889d";

interface Tip { x: number; y: number; lines: string[] }

function Tooltip({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  return (
    <div className="pointer-events-none absolute z-10 rounded-md border border-line-2 bg-surface-3 px-2.5 py-1.5 text-xs text-ink shadow-lg"
      style={{ left: tip.x, top: tip.y, transform: "translate(-50%, calc(-100% - 10px))" }}>
      {tip.lines.map((l, i) => <div key={i} className={i === 0 ? "font-semibold" : "text-ink-2"}>{l}</div>)}
    </div>
  );
}

/** Horizontal bar list: one series, one axis, value labels on the right. */
export function BarList({ data, max = 1, format = (v: number) => v.toFixed(3), color = S1, ariaLabel, detail }: {
  data: { label: string; value: number; note?: string }[]; max?: number; format?: (v: number) => string; color?: string; ariaLabel: string;
  detail?: (d: { label: string; value: number; note?: string }) => string[];
}) {
  const [tip, setTip] = useState<Tip | null>(null);
  const rowH = 30, labelW = 170, valueW = 64, W = 640;
  const plotW = W - labelW - valueW;
  const H = data.length * rowH + 22;
  return (
    <div className="relative w-full overflow-x-auto scroll-thin">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[480px]" role="img" aria-label={ariaLabel} onMouseLeave={() => setTip(null)}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={labelW + f * plotW} x2={labelW + f * plotW} y1={0} y2={H - 18} stroke={GRID} strokeWidth={1} />
            <text x={labelW + f * plotW} y={H - 4} fill={INK3} fontSize={10} textAnchor="middle">{format(f * max)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const y = i * rowH + 6;
          const w = Math.max(0, Math.min(1, d.value / max)) * plotW;
          return (
            <g key={d.label}>
              <text x={labelW - 10} y={y + 13} fill={INK2} fontSize={12} textAnchor="end">{d.label}</text>
              <rect x={labelW} y={y + 2} width={Math.max(w, 2)} height={16} rx={4} fill={color} />
              <text x={labelW + w + 6} y={y + 14} fill={INK2} fontSize={11}>{format(d.value)}</text>
              {/* hit target larger than the mark */}
              <rect x={0} y={y - 4} width={W} height={rowH} fill="transparent"
                onMouseMove={(e) => {
                  const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  setTip({ x: e.clientX - r.left, y: e.clientY - r.top, lines: detail ? detail(d) : [d.label, format(d.value), ...(d.note ? [d.note] : [])] });
                }} />
            </g>
          );
        })}
      </svg>
      <Tooltip tip={tip} />
    </div>
  );
}

/** Reliability diagram: predicted vs observed scam rate, with the perfect-calibration diagonal. */
export function ReliabilityChart({ bins }: { bins: { bin_low: number; bin_high: number; count: number; mean_predicted: number | null; observed_scam_rate: number | null }[] }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const W = 360, H = 300, m = { l: 44, r: 14, t: 12, b: 40 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b;
  const x = (v: number) => m.l + v * pw;
  const y = (v: number) => m.t + (1 - v) * ph;
  const pts = bins.filter((b) => b.count > 0 && b.mean_predicted !== null && b.observed_scam_rate !== null);
  const path = pts.map((b, i) => `${i ? "L" : "M"}${x(b.mean_predicted!)},${y(b.observed_scam_rate!)}`).join(" ");
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[420px]" role="img" aria-label="Reliability diagram: observed scam rate against predicted probability" onMouseLeave={() => setTip(null)}>
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke={GRID} />
            <text x={m.l - 8} y={y(v) + 4} fill={INK3} fontSize={10} textAnchor="end">{v}</text>
            <text x={x(v)} y={H - m.b + 16} fill={INK3} fontSize={10} textAnchor="middle">{v}</text>
          </g>
        ))}
        <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} stroke={INK3} strokeDasharray="4 4" strokeWidth={1.5} />
        <path d={path} fill="none" stroke={S1} strokeWidth={2} />
        {pts.map((b) => (
          <g key={b.bin_low}>
            <circle cx={x(b.mean_predicted!)} cy={y(b.observed_scam_rate!)} r={4.5} fill={S1} stroke="#111a2e" strokeWidth={2} />
            <circle cx={x(b.mean_predicted!)} cy={y(b.observed_scam_rate!)} r={14} fill="transparent"
              onMouseMove={(e) => {
                const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                const sx = r.width / W;
                setTip({ x: x(b.mean_predicted!) * sx, y: y(b.observed_scam_rate!) * sx, lines: [`Bin ${b.bin_low.toFixed(1)}–${b.bin_high.toFixed(1)}`, `Predicted ${(b.mean_predicted! * 100).toFixed(1)}%`, `Observed ${(b.observed_scam_rate! * 100).toFixed(1)}%`, `${b.count} messages`] });
              }} />
          </g>
        ))}
        <text x={m.l + pw / 2} y={H - 6} fill={INK2} fontSize={11} textAnchor="middle">Predicted scam probability</text>
        <text x={12} y={m.t + ph / 2} fill={INK2} fontSize={11} textAnchor="middle" transform={`rotate(-90 12 ${m.t + ph / 2})`}>Observed scam rate</text>
      </svg>
      <div className="mt-2 flex gap-4 text-xs text-ink-2">
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 rounded" style={{ background: S1 }} />SCAMPRINT (test)</span>
        <span className="flex items-center gap-1.5"><span className="h-0 w-5 border-t border-dashed" style={{ borderColor: INK3 }} />Perfect calibration</span>
      </div>
      <Tooltip tip={tip} />
    </div>
  );
}

/** Confidence meter: a single bar, labelled - not a gauge. */
export function ConfidenceBar({ value, tone }: { value: number; tone: "scam" | "safe" }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} aria-label="Confidence">
      <div className={`h-full rounded-full ${tone === "scam" ? "bg-scam" : "bg-safe"}`} style={{ width: `${value * 100}%`, transition: "width 300ms ease-out" }} />
    </div>
  );
}
