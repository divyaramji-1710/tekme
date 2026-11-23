import { Accessibility, Download, Keyboard, Languages, Palette, Shield } from "lucide-react";
import { useApp } from "../app/context";
import { PageHeader } from "../components/Shell";
import { Panel } from "../components/ui";
import type { Settings as S } from "../analysis/store";

function Radio<T extends string | number>({ name, value, options, onChange }: { name: string; value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={name} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <label key={String(o.v)} className={`cursor-pointer rounded-lg border px-3.5 py-2 text-sm ${value === o.v ? "border-accent bg-accent-soft font-semibold text-ink" : "border-line-2 text-ink-2 hover:text-ink"}`}>
          <input type="radio" className="sr-only" name={name} checked={value === o.v} onChange={() => onChange(o.v)} />{o.label}
        </label>
      ))}
    </div>
  );
}
const Row = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <div className="grid gap-2 border-b border-line py-4 last:border-0 md:grid-cols-[240px_1fr] md:items-center">
    <div><div className="font-semibold text-ink">{label}</div>{hint && <div className="text-xs text-ink-3">{hint}</div>}</div><div>{children}</div>
  </div>
);
const Toggle = ({ checked, onChange, label }: { checked: boolean; onChange: (b: boolean) => void; label: string }) => (
  <label className="inline-flex cursor-pointer items-center gap-3 text-sm text-ink">
    <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
    <span className="relative h-6 w-11 rounded-full bg-surface-3 transition-colors peer-checked:bg-accent peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-accent after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-ink after:transition-transform peer-checked:after:translate-x-5" aria-hidden />
    {label}
  </label>
);

export default function Settings() {
  const { settings: s, update } = useApp();
  const red = (k: keyof S["redact"], v: boolean) => update({ redact: { ...s.redact, [k]: v } });
  return (
    <div>
      <PageHeader eyebrow="Settings & accessibility" title="Make TEKMĒ yours">Settings are stored only in this browser.</PageHeader>
      <div className="space-y-5">
        <Panel title="Appearance" icon={<Palette className="h-5 w-5" />}>
          <Row label="Theme" hint="System follows your device"><Radio name="Theme" value={s.theme} onChange={(v) => update({ theme: v })} options={[{ v: "dark", label: "Dark" }, { v: "light", label: "Light" }, { v: "system", label: "System" }]} /></Row>
          <Row label="Text size"><Radio name="Text size" value={s.textScale} onChange={(v) => update({ textScale: v })} options={[{ v: 100, label: "Default" }, { v: 112, label: "Large" }, { v: 125, label: "Larger" }]} /></Row>
          <Row label="Motion" hint="Animations and transitions"><Radio name="Motion" value={s.motion} onChange={(v) => update({ motion: v })} options={[{ v: "system", label: "Follow system" }, { v: "reduce", label: "Reduce" }, { v: "full", label: "Full" }]} /></Row>
          <Row label="High contrast" hint="Strengthens secondary text and borders"><Toggle checked={s.highContrast} onChange={(b) => update({ highContrast: b })} label={s.highContrast ? "On" : "Off"} /></Row>
        </Panel>
        <Panel title="Language" icon={<Languages className="h-5 w-5" />}>
          <Row label="Explanations & guidance" hint="Hinglish uses fixed local templates"><Radio name="Language" value={s.lang} onChange={(v) => update({ lang: v })} options={[{ v: "en", label: "English" }, { v: "hinglish", label: "Hinglish" }]} /></Row>
        </Panel>
        <Panel title="Data & retention" icon={<Shield className="h-5 w-5" />}>
          <Row label="Local analysis history" hint="Off by default"><Toggle checked={s.history} onChange={(b) => update({ history: b })} label={s.history ? "Keep history on this device" : "Do not keep history"} /></Row>
          <Row label="Keep history for"><Radio name="Retention" value={s.retentionDays} onChange={(v) => update({ retentionDays: v })} options={[{ v: 1, label: "1 day" }, { v: 7, label: "7 days" }, { v: 30, label: "30 days" }]} /></Row>
          <p className="pt-3 text-sm text-ink-2">Delete stored data in the <a className="text-accent underline" href="#/privacy">Privacy Center</a>.</p>
        </Panel>
        <Panel title="Export redaction" icon={<Download className="h-5 w-5" />}>
          <div className="grid gap-3 sm:grid-cols-2">
            {([["phones", "Phone numbers"], ["upi", "UPI IDs"], ["urls", "Links"], ["emails", "E-mail addresses"], ["numbers", "Codes & long numbers"], ["amounts", "Money amounts"]] as const).map(([k, l]) => <Toggle key={k} checked={s.redact[k]} onChange={(b) => red(k, b)} label={l} />)}
          </div>
        </Panel>
        <Panel title="Keyboard" icon={<Keyboard className="h-5 w-5" />}>
          <ul className="space-y-1 text-sm text-ink">
            <li><kbd className="rounded border border-line-2 px-1.5">Tab</kbd> moves through every control; a visible focus ring shows where you are.</li>
            <li><kbd className="rounded border border-line-2 px-1.5">Ctrl</kbd> + <kbd className="rounded border border-line-2 px-1.5">Enter</kbd> analyses the message in any message box.</li>
            <li>Highlights in the evidence heatmap are focusable; <kbd className="rounded border border-line-2 px-1.5">Enter</kbd> shows what each one means.</li>
            <li>“Skip to content” appears on the first <kbd className="rounded border border-line-2 px-1.5">Tab</kbd>; <kbd className="rounded border border-line-2 px-1.5">Esc</kbd> closes the mobile menu.</li>
          </ul>
        </Panel>
        <Panel title="Accessibility statement" icon={<Accessibility className="h-5 w-5" />}>
          <p className="text-sm text-ink-2">Verdicts are always written in words and icons, never colour alone; charts have text equivalents; text colours meet WCAG AA contrast in both themes (checked by an automated test). Report problems to the developer.</p>
        </Panel>
      </div>
    </div>
  );
}
