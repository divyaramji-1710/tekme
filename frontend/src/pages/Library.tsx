import { useMemo, useState } from "react";
import { BookOpen, Search } from "lucide-react";
import { useApp } from "../app/context";
import { PageHeader } from "../components/Shell";
import { Chip, Panel, levelLabel, levelTone } from "../components/ui";
import { CATEGORY_LABEL } from "../components/result";
import { RULES } from "../engine/rules";

// The threat library is generated from the same rule files the engine executes (engine/generated/rules.json),
// plus the scam families fitted on training data. Its version id is a hash of those rules.
const SIGNALS: { id: string; label: string; level: string; detail: string }[] = [
  { id: "lookalike_domain", label: "Look-alike domain", level: "high", detail: "A host that resembles a known brand but is not on its local domain list." },
  { id: "brand_domain_mismatch", label: "Claimed brand ≠ link domain", level: "high", detail: "The message names a brand but links elsewhere." },
  { id: "ip_link", label: "Link to a raw IP address", level: "high", detail: "Legitimate services use domain names." },
  { id: "punycode", label: "Punycode domain", level: "high", detail: "Internationalised names can disguise look-alike characters." },
  { id: "at_in_url", label: "'@' inside link", level: "high", detail: "Text before '@' is ignored by browsers." },
  { id: "shortened_link", label: "Shortened link", level: "medium", detail: "Hides the real destination." },
  { id: "suspicious_tld", label: "Unusual domain ending", level: "medium", detail: `Cheap endings common in phishing: ${RULES.suspicious_tlds.slice(0, 10).join(", ")}…` },
  { id: "many_subdomains", label: "Excessive sub-domains", level: "medium", detail: "Very deep host names push the real domain out of view." },
  { id: "defanged_link", label: "Disguised link formatting", level: "medium", detail: "hxxp:// or [.] used to evade filters." },
  { id: "messaging_app", label: "Moves to WhatsApp / Telegram", level: "medium", detail: "Leaving official channels is a common step." },
  { id: "obfuscation", label: "Disguised characters", level: "medium", detail: "Look-alike letters, invisible characters, digit swaps, spaced letters." },
  { id: "call_request", label: "Asks you to call a number", level: "low", detail: "Scammers use personal numbers." },
  { id: "upi_id", label: "UPI ID present", level: "low", detail: "A payment address is included." },
  { id: "large_amount", label: "Large sum of money", level: "low", detail: "Typical of prize and loan lures." },
];
type Item = { kind: "Tactic" | "Signal" | "Genuine pattern" | "Scam family"; title: string; body: string; extra?: string; tags: string[]; level?: string };

export default function Library() {
  const { intel } = useApp();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<string>("all");
  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const t of RULES.tactics.list) out.push({ kind: "Tactic", title: t.label, body: t.description, extra: `${t.cues.length} cue patterns (English, Hinglish, Devanagari)${t.needs_context ? " · only counts together with pressure, a request or a link" : ""}`, tags: [t.id] });
    for (const s of SIGNALS) out.push({ kind: "Signal", title: s.label, body: s.detail, tags: [s.id], level: s.level });
    for (const [id, t] of Object.entries(RULES.benign.TEMPLATES)) out.push({ kind: "Genuine pattern", title: t.description, body: `${t.patterns.length} patterns. Genuine-looking evidence never overrides a malicious instruction (e.g. asking to share the OTP).`, tags: [id] });
    for (const f of intel?.families.filter((x) => x.is_scam_family) ?? []) out.push({ kind: "Scam family", title: `Family #${f.cluster}${f.dominant_category ? " · " + CATEGORY_LABEL[f.dominant_category] : ""}`, body: `Typical words: ${f.top_terms.join(", ")}. ${f.size} training messages, ${Math.round(f.synthetic_share * 100)}% synthetic.`, extra: f.examples[0] ? `Example (redacted): “${f.examples[0].text}”` : undefined, tags: Object.keys(f.tactic_share) });
    return out;
  }, [intel]);
  const shown = items.filter((i) => (kind === "all" || i.kind === kind) && (!q || (i.title + " " + i.body + " " + (i.extra ?? "") + " " + i.tags.join(" ")).toLowerCase().includes(q.toLowerCase())));
  return (
    <div>
      <PageHeader eyebrow="Threat library" title="Local scam pattern library">
        Every pattern TEKMĒ uses, browsable offline. Version <code>{(RULES as unknown as { version?: { id: string } }).version?.id ?? "dev"}</code> — generated from the engine's own rule files and the training-data clusters. Nothing is fetched from the internet; this is not live threat intelligence.
      </PageHeader>
      <Panel as="div">
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="relative flex-1"><span className="sr-only">Search patterns</span>
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: OTP, lottery, telegram, KYC…" className="w-full rounded-lg border border-line-2 bg-bg-2 py-2 pl-9 pr-3 text-ink" />
          </label>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by kind">
            {["all", "Tactic", "Signal", "Genuine pattern", "Scam family"].map((k) => (
              <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${kind === k ? "bg-accent text-on-accent" : "border border-line-2 text-ink-2"}`}>{k === "all" ? "All" : k + "s"}</button>
            ))}
          </div>
        </div>
        <p className="mt-3 text-xs text-ink-3" aria-live="polite">{shown.length} of {items.length} patterns</p>
      </Panel>
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((i, k) => (
          <article key={k} className="panel p-5">
            <div className="flex items-center justify-between gap-2"><Chip tone={i.kind === "Tactic" ? "scam" : i.kind === "Signal" ? levelTone(i.level ?? "low") : i.kind === "Genuine pattern" ? "safe" : "accent"}>{i.kind}{i.level ? ` · ${levelLabel(i.level)}` : ""}</Chip><BookOpen className="h-4 w-4 text-ink-3" aria-hidden /></div>
            <h2 className="mt-2 font-display text-[1.35rem] font-semibold leading-tight text-ink">{i.title}</h2>
            <p className="mt-1 text-[0.88rem] text-ink-2">{i.body}</p>
            {i.extra && <p className="mt-2 text-xs text-ink-3">{i.extra}</p>}
          </article>
        ))}
      </div>
    </div>
  );
}
