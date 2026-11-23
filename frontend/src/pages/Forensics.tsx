import { useEffect, useRef, useState } from "react";
import { Fingerprint, IndianRupee, Landmark, Link2, ListOrdered, Search, UserRound } from "lucide-react";
import { useApp } from "../app/context";
import { PageHeader } from "../components/Shell";
import { ExampleChips, MessageInput, useAnalysis, EXAMPLES } from "../components/AnalyzerWidget";
import { VerdictBanner, CATEGORY_LABEL } from "../components/result";
import { Chip, Empty, ErrorBox, Note, Panel, levelLabel, levelTone } from "../components/ui";
import type { Analysis } from "../analysis/analyze";

function timeline(a: Analysis) {
  const items: { start: number; end: number; text: string; label: string; kind: string; level: string }[] = [];
  const st: Record<string, string> = { strong: "high", moderate: "medium", weak: "low" };
  for (const t of a.core.tactics) for (const e of t.evidence) items.push({ ...e, label: t.label, kind: "Tactic", level: st[t.strength] });
  for (const s of a.core.risk_signals) for (const e of s.evidence) items.push({ ...e, label: s.label, kind: "Signal", level: s.severity });
  for (const p of a.payment.indicators) for (const e of p.evidence ?? []) items.push({ ...e, label: p.label, kind: "Payment", level: p.level });
  for (const e of a.core.benign.evidence) items.push({ ...e, label: "Genuine-message pattern", kind: "Genuine", level: "info" });
  return items.filter((i) => i.end > i.start).sort((x, y) => x.start - y.start || x.end - y.end);
}

export default function Forensics({ params }: { params: URLSearchParams }) {
  const { status, error: loadError, retry, intel } = useApp();
  const { analysis: a, error, busy, run, ready } = useAnalysis();
  const [text, setText] = useState(params.get("text") ?? EXAMPLES.find((e) => e.id === "kyc_en")?.text ?? "");
  const [sender, setSender] = useState("");
  const [mode, setMode] = useState<"message" | "url" | "upi">("message");
  const once = useRef(false);
  useEffect(() => { if (ready && !once.current && text) { once.current = true; run(text, sender); } }, [ready, run, text, sender]);
  const fam = a?.familiarity?.nearest;
  return (
    <div>
      <PageHeader eyebrow="Scam forensics" title="Inspect the evidence">
        Links, payment requests, brand claims and sender IDs are inspected offline. Nothing is visited, resolved or looked up: findings come from the text itself and a small local list of official domains, so a clean result is never proof of safety.
      </PageHeader>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel as="div">
          <MessageInput text={text} setText={setText} mode={mode} setMode={setMode} onAnalyze={() => run(text, sender)} busy={busy} disabled={!ready} id="forensics-message" />
          <label htmlFor="f-sender" className="mt-4 block text-sm text-ink-2">Sender ID (optional)</label>
          <input id="f-sender" value={sender} onChange={(e) => setSender(e.target.value)} placeholder="e.g. AX-SBIBNK or +91 98xxxxxx10" className="mt-1 w-full rounded-lg border border-line-2 bg-bg-2 px-3 py-2 text-ink" />
          <ExampleChips onPick={(t) => { setText(t); run(t, sender); }} />
          {error && <div className="mt-3"><ErrorBox message={error} /></div>}
          {status === "error" && <div className="mt-3"><ErrorBox message={loadError ?? ""} onRetry={retry} /></div>}
        </Panel>
        <div>{a ? <Panel as="div"><VerdictBanner a={a} compact /><p className="mt-3 text-sm text-ink-2">{a.core.explanation}</p></Panel> : <Panel as="div"><Empty icon={<Search className="h-6 w-6" />} title="Nothing inspected yet" /></Panel>}</div>
      </div>
      {a && (
        <div className="mt-5 grid gap-5 lg:grid-cols-2 fade-in">
          <Panel title="Link forensics" icon={<Link2 className="h-5 w-5" />} className="lg:col-span-2">
            {!a.urls.length ? <p className="text-sm text-ink-3">No links found in the message.</p> : (
              <div className="grid gap-4 md:grid-cols-2">
                {a.urls.map((u) => (
                  <div key={u.url} className="rounded-xl border border-line bg-bg-2 p-4">
                    <div className="flex items-start justify-between gap-2"><code className="break-all text-[0.85rem] text-ink">{u.url}</code><Chip tone={levelTone(u.risk)}>{u.risk === "info" ? "No red flags" : `${levelLabel(u.risk)} risk`}</Chip></div>
                    <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[0.82rem]">
                      <dt className="text-ink-3">Host</dt><dd className="break-all text-ink">{u.host || "—"}</dd>
                      <dt className="text-ink-3">Registered domain</dt><dd className="text-ink">{u.registered_domain || "—"}</dd>
                      <dt className="text-ink-3">Scheme</dt><dd className="text-ink">{u.scheme}</dd>
                      {u.subdomains.length > 0 && <><dt className="text-ink-3">Sub-domains</dt><dd className="text-ink">{u.subdomains.join(" · ")}</dd></>}
                      {u.unicode_host && <><dt className="text-ink-3">Displays as</dt><dd className="text-ink">{u.unicode_host}</dd></>}
                    </dl>
                    <ul className="mt-3 space-y-1.5">
                      {u.indicators.map((i) => <li key={i.id} className="text-[0.84rem]"><Chip tone={levelTone(i.level)}>{levelLabel(i.level)}</Chip> <b className="text-ink">{i.label}</b> <span className="text-ink-2">— {i.detail}</span></li>)}
                      {!u.indicators.length && <li className="text-[0.84rem] text-ink-3">No structural red flags. This is not proof the link is safe.</li>}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Panel>
          <Panel title="Payment & UPI" icon={<IndianRupee className="h-5 w-5" />}>
            <p className="text-sm text-ink">{a.payment.summary}</p>
            {(a.payment.upi_ids.length > 0 || a.payment.amounts.length > 0) && (
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {a.payment.upi_ids.map((u) => <Chip key={u.id} tone="info">UPI {u.id}</Chip>)}
                {a.payment.amounts.map((m) => <Chip key={m}>{m}</Chip>)}
              </div>
            )}
            <ul className="mt-3 space-y-2">{a.payment.indicators.map((i) => <li key={i.id} className="text-[0.86rem]"><Chip tone={levelTone(i.level)}>{levelLabel(i.level)}</Chip> <b className="text-ink">{i.label}</b><div className="text-ink-2">{i.detail}</div></li>)}</ul>
          </Panel>
          <Panel title="Brand claims" icon={<Landmark className="h-5 w-5" />}>
            {!a.brands.length ? <p className="text-sm text-ink-3">No known brand or institution is mentioned.</p> : (
              <ul className="space-y-3">{a.brands.map((b) => (
                <li key={b.brand} className="text-[0.88rem]">
                  <div className="flex items-center gap-2"><b className="text-ink">{b.brand.toUpperCase()}</b><Chip tone={b.link_relation === "official" ? "safe" : b.link_relation === "none" ? "neutral" : "scam"}>{{ official: "link on local list", lookalike: "look-alike link", unrelated: "unrelated link", shortened: "hidden link", none: "no link" }[b.link_relation]}</Chip></div>
                  <p className="mt-1 text-ink-2">{b.statement}</p>
                  <p className="mt-1 text-xs text-ink-3">Known domains: {b.official_domains.join(", ")}</p>
                </li>
              ))}</ul>
            )}
            <div className="mt-3"><Note>TEKMĒ never marks a sender as officially verified: it can only compare the text with a local list.</Note></div>
          </Panel>
          <Panel title="Sender" icon={<UserRound className="h-5 w-5" />}>
            {!a.sender.length ? <p className="text-sm text-ink-3">Add the sender ID above to check its format.</p> : <ul className="space-y-2">{a.sender.map((s) => <li key={s.id} className="text-[0.86rem]"><Chip tone={levelTone(s.level)}>{levelLabel(s.level)}</Chip> <b className="text-ink">{s.label}</b><div className="text-ink-2">{s.detail}</div></li>)}</ul>}
          </Panel>
          <Panel title="Similar local patterns" icon={<Fingerprint className="h-5 w-5" />}>
            {!intel || !fam ? <p className="text-sm text-ink-3">Pattern data not loaded.</p> : (
              <div className="text-[0.88rem]">
                <p className="text-ink">Closest training cluster #{fam.cluster} ({fam.size} messages, {(fam.scam_share * 100).toFixed(0)}% scam){fam.dominant_category ? `, mostly ${CATEGORY_LABEL[fam.dominant_category]}` : ""}. Similarity {a.familiarity!.similarity.toFixed(2)}.</p>
                <p className="mt-1 text-ink-2">Typical words: {fam.top_terms.join(", ")}</p>
                <ul className="mt-2 space-y-1.5">{fam.examples.slice(0, 2).map((e, i) => <li key={i} className="rounded-lg border border-line bg-bg-2 p-2 text-xs text-ink-2">“{e.text}” {e.synthetic && <Chip tone="neutral">synthetic</Chip>}</li>)}</ul>
                <p className="mt-2 text-xs text-ink-3">Examples come from the public training data, redacted. Similarity is not a verdict.</p>
              </div>
            )}
          </Panel>
          <Panel title="Evidence timeline" icon={<ListOrdered className="h-5 w-5" />} className="lg:col-span-2">
            {(() => {
              const items = timeline(a);
              if (!items.length) return <p className="text-sm text-ink-3">No evidence spans in this message.</p>;
              return (
                <ol className="space-y-2">
                  {items.map((i, k) => (
                    <li key={k} className="grid grid-cols-[4.5rem_6rem_1fr] items-baseline gap-3 text-[0.86rem]">
                      <span className="tabular-nums text-ink-3">char {i.start}</span>
                      <Chip tone={levelTone(i.level)}>{i.kind}</Chip>
                      <span><b className="text-ink">{i.label}</b> <span className="text-ink-2">“{i.text}”</span></span>
                    </li>
                  ))}
                </ol>
              );
            })()}
            <p className="mt-3 text-xs text-ink-3">Ordered by where each piece of evidence appears in the message.</p>
          </Panel>
        </div>
      )}
    </div>
  );
}
