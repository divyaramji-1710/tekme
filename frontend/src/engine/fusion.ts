// Port of backend/engines/fusion.py: standardised logistic regression + isotonic / sigmoid calibration.
import type { FusionSpec } from "./textmodel";

export class Fusion {
  constructor(readonly spec: FusionSpec) {}
  vector(row: Record<string, number>): number[] { return this.spec.names.map((n) => Number(row[n] ?? 0)); }
  logit(row: Record<string, number>): number {
    const x = this.vector(row);
    let z = this.spec.intercept;
    x.forEach((v, i) => { z += this.spec.coef[i] * ((v - this.spec.mean[i]) / this.spec.scale[i]); });
    return z;
  }
  calibrate(z: number): number {
    const c = this.spec.calibrator;
    if (!c) return 1 / (1 + Math.exp(-z));
    if (c.method === "sigmoid") return 1 / (1 + Math.exp(-(c.a! * z + c.b!)));
    return interp(z, c.x!, c.y!);
  }
  proba(row: Record<string, number>): number { return this.calibrate(this.logit(row)); }
  /** Exact per-feature contributions to the logit, largest magnitude first. */
  contributions(row: Record<string, number>): [string, number][] {
    const x = this.vector(row);
    return this.spec.names
      .map((n, i): [string, number] => [n, this.spec.coef[i] * ((x[i] - this.spec.mean[i]) / (this.spec.scale[i] === 0 ? 1 : this.spec.scale[i]))])
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  }
}

/** numpy.interp with clipping (IsotonicRegression(out_of_bounds="clip").predict). */
export function interp(v: number, xs: number[], ys: number[]): number {
  if (v <= xs[0]) return ys[0];
  const n = xs.length;
  if (v >= xs[n - 1]) return ys[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= v) lo = mid; else hi = mid; }
  const t = (v - xs[lo]) / (xs[hi] - xs[lo]);
  return ys[lo] + t * (ys[hi] - ys[lo]);
}
