// WCAG 2.1 contrast of the theme tokens actually defined in src/styles/index.css, in both themes.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "../src/styles/index.css"), "utf-8");
function tokens(selector: string): Record<string, string> {
  const block = css.slice(css.indexOf(selector)).split("}")[0];
  return Object.fromEntries([...block.matchAll(/--t-([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
}
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
export const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

for (const [name, sel] of [["dark", ':root, [data-theme="dark"]'], ["light", '[data-theme="light"]']] as const) {
  describe(`${name} theme contrast`, () => {
    const t = tokens(sel);
    const text: [string, string][] = [];
    for (const fg of ["ink", "ink-2", "ink-3"]) for (const bg of ["bg", "bg-2", "surface", "surface-2"]) text.push([fg, bg]);
    for (const s of ["scam", "safe", "uncertain", "warn", "info"]) { text.push([s, `${s}-bg`]); text.push([s, "surface"]); }
    text.push(["accent", "surface"], ["accent", "bg"], ["on-accent", "accent"]);
    for (const [fg, bg] of text) {
      it(`${fg} on ${bg} ≥ 4.5:1`, () => {
        expect(t[fg], `missing token ${fg}`).toBeTruthy();
        expect(t[bg], `missing token ${bg}`).toBeTruthy();
        expect(ratio(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5);
      });
    }
    it("chart series ≥ 3:1 against the surface", () => {
      expect(ratio(t["series-1"], t.surface)).toBeGreaterThanOrEqual(3);
      expect(ratio(t["series-2"], t.surface)).toBeGreaterThanOrEqual(3);
    });
  });
}
