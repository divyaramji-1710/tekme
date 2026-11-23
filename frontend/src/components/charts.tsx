import { useState } from "react";

// Hand-built SVG charts: no chart library, no remote assets. Colours come from theme tokens validated with the
// dataviz validator (dark: #c27f42 / #4b93ea on #1f120e; light: #a85a2a / #2f6fa8 on #fffcf8).
const S1 = "var(--t-series-1)";
const S2 = "var(--t-series-2)";
const GRID = "var(--t-line)";
const INK2 = "var(--t-ink-2)";
const INK3 = "var(--t-ink-3)";

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

/** Horizontal bars, one series (or two with a legend), one axis, value labels at the bar end. */
export function BarList({ data, max = 1, format = (v: number) => v.toFixed(3), ariaLabel, series2, legend, labelW = 180 }: {
  data: { label: string; value: number; value2?: number; note?: string }[]; max?: number; format?: (v: number) => string; ariaLabel: string;
  series2?: boolean; legend?: [string, string]; labelW?: number;
}) {
  const [tip, setTip] = useState<Tip | null>(null);
  const rowH = series2 ? 38 : 30, valueW = 64, W = 680;
  const plotW = W - labelW - valueW;
  const H = data.length * rowH + 22;
  return (
    <div className="relative w-full overflow-x-auto scroll-thin">
      {series2 && legend && (
        <div className="mb-2 flex gap-4 text-xs text-ink-2">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm" style={{ background: S1 }} />{legend[0]}</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm" style={{ background: S2 }} />{legend[1]}</span>
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[480px]" role="img" aria-label={ariaLabel} onMouseLeave={() => setTip(null)}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={labelW + f * plotW} x2={labelW + f * plotW} y1={0} y2={H - 18} stroke={GRID} strokeWidth={1} />
            <text x={labelW + f * plotW} y={H - 4} fill={INK3} fontSize={10} textAnchor="middle">{format(f * max)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const y = i * rowH + 6;
          const w1 = Math.max(0, Math.min(1, d.value / max)) * plotW;
          const w2 = Math.max(0, Math.min(1, (d.value2 ?? 0) / max)) * plotW;
          const h = series2 ? 13 : 16;
          return (
            <g key={d.label}>
              <text x={labelW - 10} y={y + (series2 ? 18 : 13)} fill={INK2} fontSize={12} textAnchor="end">{d.label}</text>
              <rect x={labelW} y={y + 2} width={Math.max(w1, 2)} height={h} rx={4} fill={S1} />
              <text x={labelW + w1 + 6} y={y + 13} fill={INK2} fontSize={11}>{format(d.value)}</text>
              {series2 && d.value2 !== undefined && <>
                <rect x={labelW} y={y + h + 4} width={Math.max(w2, 2)} height={h} rx={4} fill={S2} />
                <text x={labelW + w2 + 6} y={y + h + 15} fill={INK2} fontSize={11}>{format(d.value2)}</text>
              </>}
              <rect x={0} y={y - 4} width={W} height={rowH} fill="transparent"
                onMouseMove={(e) => {
                  const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  setTip({ x: e.clientX - r.left, y: e.clientY - r.top, lines: [d.label, `${legend?.[0] ?? "Value"}: ${format(d.value)}`, ...(d.value2 !== undefined ? [`${legend?.[1] ?? "Value 2"}: ${format(d.value2)}`] : []), ...(d.note ? [d.note] : [])] });
                }} />
            </g>
          );
        })}
      </svg>
      <Tooltip tip={tip} />
    </div>
  );
}

export interface RelBin { bin_low: number; bin_high: number; count: number; mean_predicted: number | null; observed_scam_rate: number | null }
/** Reliability diagram: predicted vs observed scam rate, with the perfect-calibration diagonal. */
export function ReliabilityChart({ bins, label = "TEKMĒ (test split)" }: { bins: RelBin[]; label?: string }) {
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
            <circle cx={x(b.mean_predicted!)} cy={y(b.observed_scam_rate!)} r={4.5} fill={S1} stroke="var(--t-surface)" strokeWidth={2} />
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
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 rounded" style={{ background: S1 }} />{label}</span>
        <span className="flex items-center gap-1.5"><span className="h-0 w-5 border-t border-dashed" style={{ borderColor: "var(--t-ink-3)" }} />Perfect calibration</span>
      </div>
      <Tooltip tip={tip} />
    </div>
  );
}

/** Small multiples heat table: rows x columns with shaded cells and the value printed in each cell. */
export function HeatTable({ rows, cols, value, format = (v: number) => `${Math.round(v * 100)}%`, caption }: {
  rows: { key: string; label: string }[]; cols: { key: string; label: string }[]; value: (r: string, c: string) => number | null; format?: (v: number) => string; caption: string;
}) {
  return (
    <div className="overflow-x-auto scroll-thin">
      <table className="w-full min-w-[620px] border-separate border-spacing-[2px] text-[0.8rem]">
        <caption className="sr-only">{caption}</caption>
        <thead><tr><th className="p-2 text-left font-medium text-ink-3">Source</th>{cols.map((c) => <th key={c.key} scope="col" className="p-2 text-center font-medium text-ink-3">{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <th scope="row" className="p-2 text-left font-medium text-ink">{r.label}</th>
              {cols.map((c) => {
                const v = value(r.key, c.key);
                return <td key={c.key} className="rounded-md p-2 text-center tabular-nums text-ink" style={{ background: v === null ? "transparent" : `color-mix(in srgb, var(--t-series-1) ${Math.round(8 + v * 80)}%, var(--t-surface))` }}>{v === null ? "—" : format(v)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
