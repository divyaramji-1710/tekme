import { useState } from "react";
import { ArrowRight, MessagesSquare, TrendingUp } from "lucide-react";
import { useApp } from "../app/context";
import { PageHeader } from "../components/Shell";
import { Button, Chip, ErrorBox, Note, Panel, confPct } from "../components/ui";
import { analyseConversation, parseConversation, STAGE_INFO, type ConversationResult } from "../analysis/conversation";
import { MarkLoader } from "../brand/EvidenceMark";

const SAMPLES = [
  { title: "Fake bank officer (escalating)", text: `Unknown: Hello sir, I am calling from the customer care team of your bank.
Me: Yes, what is it?
Unknown: Your KYC is pending. Your account will be blocked today if not updated.
Unknown: Please update immediately at http://kyc-update-portal.example/verify
Unknown: You will get an OTP now. Share the OTP with our officer to complete verification.` },
  { title: "Part-time job lure", text: `HR: Hi! We are hiring for a part time online job. Earn 3000 per day from home.
Me: What is the work?
HR: Simple tasks - like YouTube videos and get paid. Join our Telegram group.
HR: To unlock higher tasks you must deposit Rs 2000 registration fee first. Pay to jobs.task@ybl` },
  { title: "Ordinary chat", text: `Riya: hey are you coming for dinner tonight?
Me: yes, reaching by 8
Riya: ok great, bring the charger pls` },
];
const STAGE_TONE: Record<string, "neutral" | "info" | "warn" | "scam" | "accent"> = { rapport: "neutral", authority: "info", lure: "info", link: "warn", pressure: "warn", payment: "scam", credential: "scam" };

export default function Conversation() {
  const { engine, status, error, retry } = useApp();
  const [text, setText] = useState(SAMPLES[0].text);
  const [res, setRes] = useState<ConversationResult | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const run = (t = text) => {
    if (!engine) return;
    const turns = parseConversation(t);
    if (!turns.length) { setMsg("Paste at least one message."); return; }
    if (turns.length > 60) { setMsg("Up to 60 turns at a time."); return; }
    setMsg(null);
    setRes(analyseConversation(engine, turns));
  };
  const riskTone = res?.risk === "high" ? "scam" : res?.risk === "elevated" ? "warn" : "safe";
  return (
    <div>
      <PageHeader eyebrow="Conversation intelligence" title="Follow the manipulation">
        Paste a whole exchange, one message per line as <code>Name: message</code>. Lines starting with <code>Me:</code> are yours and are not scored. Each incoming turn is analysed on this device, then TEKMĒ shows how the conversation moves from rapport to pressure, payment or credential requests.
      </PageHeader>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel as="div">
          <label htmlFor="conv" className="sr-only">Conversation</label>
          <textarea id="conv" rows={8} value={text} onChange={(e) => setText(e.target.value)} className="w-full rounded-xl border border-line-2 bg-bg-2 p-4 font-mono text-[0.88rem] leading-relaxed text-ink outline-none focus:border-accent" spellCheck={false} />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {SAMPLES.map((s) => <button key={s.title} onClick={() => { setText(s.text); run(s.text); }} className="rounded-full border border-line-2 px-3 py-1 text-xs text-ink hover:bg-surface-2">{s.title}</button>)}
            <Button variant="analyze" className="ml-auto" disabled={status !== "ready"} onClick={() => run()}>Analyse conversation <ArrowRight className="h-4 w-4" aria-hidden /></Button>
          </div>
          {msg && <div className="mt-3"><ErrorBox message={msg} /></div>}
          {status === "error" && <div className="mt-3"><ErrorBox message={error ?? ""} onRetry={retry} /></div>}
        </Panel>
        <Panel title="Conversation risk" icon={<TrendingUp className="h-5 w-5" />}>
          {status === "loading" ? <MarkLoader label="Loading model…" /> : !res ? <p className="text-sm text-ink-3">Run an analysis to see the risk.</p> : (
            <div className="space-y-3">
              <Chip tone={riskTone} className="text-sm">{res.risk === "high" ? "High risk" : res.risk === "elevated" ? "Elevated risk" : "Low risk"}</Chip>
              <ul className="space-y-1.5 text-sm text-ink">{res.reasons.map((r) => <li key={r}>• {r}</li>)}</ul>
              <div className="text-xs text-ink-3">Peak turn probability {confPct(res.peak_probability)} · all incoming text together: {res.combined.verdict} ({confPct(res.combined.scam_probability)})</div>
            </div>
          )}
        </Panel>
      </div>
      {res && (
        <div className="mt-5 space-y-5 fade-in">
          <Panel title="Escalation timeline" icon={<MessagesSquare className="h-5 w-5" />}>
            <ol className="relative space-y-3 border-l-2 border-line-2 pl-6">
              {res.turns.map((t) => (
                <li key={t.index} className="relative">
                  <span className={`absolute -left-[33px] top-1.5 h-4 w-4 rounded-full border-2 border-surface ${t.speaker === "me" ? "bg-surface-3" : t.verdict === "SCAM" ? "bg-scam" : "bg-safe"}`} aria-hidden />
                  <div className={`rounded-xl border p-3.5 ${t.speaker === "me" ? "ml-auto max-w-[80%] border-line bg-surface-2" : "border-line bg-bg-2"}`}>
                    <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                      <b className="text-ink">{t.speaker === "me" ? "You" : `Turn ${t.index + 1}`}</b>
                      {t.speaker === "them" && <>
                        <Chip tone={t.verdict === "SCAM" ? "scam" : "safe"}>{t.verdict} · {confPct(t.verdict === "SCAM" ? t.scam_probability! : 1 - t.scam_probability!)}</Chip>
                        {t.stages.map((s) => <Chip key={s} tone={STAGE_TONE[s]}>{STAGE_INFO[s].label}</Chip>)}
                      </>}
                    </div>
                    <p className="whitespace-pre-wrap text-[0.93rem] text-ink">{t.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
          <Panel title="Stage path" as="div">
            <div className="flex flex-wrap items-center gap-2">
              {res.escalation_path.map((s, i) => <span key={s + i} className="flex items-center gap-2"><Chip tone={STAGE_TONE[s]} className="text-sm">{STAGE_INFO[s].label}</Chip>{i < res.escalation_path.length - 1 && <ArrowRight className="h-4 w-4 text-ink-3" aria-hidden />}</span>)}
            </div>
            <div className="mt-4"><Note>{res.note}</Note></div>
          </Panel>
        </div>
      )}
    </div>
  );
}
