import { useEffect, useState } from "react";
import { CircleCheck, Database, Download, HardDrive, Lock, Network, ShieldCheck, Trash2, TriangleAlert, WifiOff } from "lucide-react";
import { useApp } from "../app/context";
import { PageHeader } from "../components/Shell";
import { Button, Chip, Note, Panel, Stat } from "../components/ui";
import { clearAll, clearFeedback, clearHistory, loadFeedback, storageAudit } from "../analysis/store";
import { download } from "../analysis/batch";
import { redact } from "../analysis/redact";
import { EXAMPLES } from "../components/AnalyzerWidget";

interface Req { name: string; origin: string; same: boolean; type: string; size: number }
function requests(): Req[] {
  return performance.getEntriesByType("resource").map((e) => {
    const r = e as PerformanceResourceTiming;
    const u = new URL(r.name, location.href);
    return { name: u.pathname + (u.search ? "?…" : ""), origin: u.origin, same: u.origin === location.origin || u.protocol === "data:" || u.protocol === "blob:", type: r.initiatorType, size: r.transferSize };
  });
}

export default function Privacy() {
  const { engine, settings } = useApp();
  const [reqs, setReqs] = useState<Req[]>(requests);
  const [store, setStore] = useState(storageAudit);
  const [cachesInfo, setCachesInfo] = useState<{ names: string[]; entries: number } | null>(null);
  const [sw, setSw] = useState<string>("checking");
  const [test, setTest] = useState<null | { ok: boolean; newRequests: number; online: boolean; ms: number; verdict: string }>(null);
  const [backend, setBackend] = useState<null | { guard?: { installed: boolean; blocked_attempts: number } }>(null);
  const [fb, setFb] = useState(loadFeedback);
  const refresh = async () => {
    setReqs(requests()); setStore(storageAudit()); setFb(loadFeedback());
    if ("caches" in window) {
      const names = await caches.keys();
      let entries = 0;
      for (const n of names) entries += (await (await caches.open(n)).keys()).length;
      setCachesInfo({ names, entries });
    }
    if ("serviceWorker" in navigator) { const r = await navigator.serviceWorker.getRegistration(); setSw(r?.active ? "active" : r ? "installing" : "not registered"); } else setSw("unsupported");
  };
  useEffect(() => {
    refresh();
    fetch("/api/privacy/status").then((r) => (r.ok ? r.json() : null)).then((j) => setBackend(j?.network_guard ? { guard: { installed: !!j.network_guard.active, blocked_attempts: Number(j.network_guard.blocked_outbound_attempts ?? 0) } } : null)).catch(() => setBackend(null));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const runOffline = () => {
    if (!engine) return;
    const before = performance.getEntriesByType("resource").length;
    const t0 = performance.now();
    const p = engine.predict(EXAMPLES[0].text);
    const ms = performance.now() - t0;
    setTimeout(() => {
      const added = performance.getEntriesByType("resource").length - before;
      setTest({ ok: added === 0, newRequests: added, online: navigator.onLine, ms, verdict: p.verdict });
      setReqs(requests());
    }, 300);
  };
  const external = reqs.filter((r) => !r.same);
  return (
    <div>
      <PageHeader eyebrow="Privacy center" title="Audit what happens to your messages">
        TEKMĒ analyses messages with a model that runs inside this browser. Messages are not sent to any server — including the computer that served this page. The checks below let you verify that yourself.
      </PageHeader>
      <div className="grid gap-5 lg:grid-cols-3">
        <Stat label="Where analysis runs" value="This device" hint={engine ? `in-browser engine, model ${engine.manifest.model_version}` : "engine loading"} tone="safe" />
        <Stat label="Requests to other origins" value={external.length} hint={`${reqs.length} page requests recorded, all listed below`} tone={external.length ? "scam" : "safe"} />
        <Stat label="Offline support" value={sw === "active" ? "Ready" : sw === "unsupported" ? "Unavailable" : "Not yet"} hint={`service worker: ${sw}${cachesInfo ? ` · ${cachesInfo.entries} cached files` : ""}`} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title="Offline prediction test" icon={<WifiOff className="h-5 w-5" />}>
          <p className="text-sm text-ink-2">Turn off Wi-Fi and mobile data (or enable flight mode), then run the test. It analyses an example message and checks that no network request was made.</p>
          <Button variant="analyze" className="mt-3" onClick={runOffline} disabled={!engine}>Run offline prediction test</Button>
          {test && (
            <div className="mt-3 space-y-1 text-sm" role="status">
              <div className="flex items-center gap-2">{test.ok ? <CircleCheck className="h-4 w-4 text-safe" aria-hidden /> : <TriangleAlert className="h-4 w-4 text-scam" aria-hidden />}<b className="text-ink">{test.ok ? "Passed: prediction made with 0 network requests" : `${test.newRequests} request(s) observed during the test`}</b></div>
              <div className="text-ink-2">Verdict {test.verdict} in {test.ms.toFixed(1)} ms · browser reports {test.online ? "online — disconnect to make the test conclusive" : "offline"}</div>
            </div>
          )}
        </Panel>
        <Panel title="Three different things" icon={<Network className="h-5 w-5" />}>
          <dl className="space-y-2 text-sm">
            <div><dt className="font-semibold text-ink">On-device (this app)</dt><dd className="text-ink-2">The model file is downloaded once with the page; every prediction then runs in your browser's memory.</dd></div>
            <div><dt className="font-semibold text-ink">Offline-capable</dt><dd className="text-ink-2">After the first visit, the service worker serves the app and model from the local cache with no connection.</dd></div>
            <div><dt className="font-semibold text-ink">Local-network processing (not used)</dt><dd className="text-ink-2">If a phone sent messages to a laptop server, that would not be on-device. TEKMĒ's optional Python API exists for scripting on the same computer only (bound to 127.0.0.1).</dd></div>
          </dl>
        </Panel>
      </div>

      <Panel title="Network audit" icon={<Network className="h-5 w-5" />} className="mt-5" action={<Button variant="ghost" onClick={refresh}>Refresh</Button>}>
        <p className="mb-3 text-sm text-ink-2">Every resource this page has requested since it loaded (from the browser's Performance API). Message text is never part of a request.</p>
        <div className="max-h-72 overflow-auto scroll-thin">
          <table className="w-full text-left text-[0.8rem]">
            <thead className="sticky top-0 bg-surface"><tr className="border-b border-line text-ink-3"><th className="py-1.5 pr-2 font-medium">Origin</th><th className="py-1.5 pr-2 font-medium">Path</th><th className="py-1.5 font-medium">Type</th></tr></thead>
            <tbody>{reqs.map((r, i) => <tr key={i} className="border-b border-line last:border-0"><td className="py-1.5 pr-2"><Chip tone={r.same ? "safe" : "scam"}>{r.same ? "same origin" : r.origin}</Chip></td><td className="break-all py-1.5 pr-2 font-mono text-ink">{r.name}</td><td className="py-1.5 text-ink-3">{r.type}</td></tr>)}</tbody>
          </table>
        </div>
      </Panel>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title="What is stored on this device" icon={<HardDrive className="h-5 w-5" />}>
          <ul className="space-y-1.5 text-sm">
            {store.map((s) => <li key={s.key} className="flex justify-between gap-2"><code className="text-ink">{s.key}</code><span className="text-ink-3">{s.items !== null ? `${s.items} items · ` : ""}{s.bytes.toLocaleString()} bytes</span></li>)}
            {!store.length && <li className="text-ink-3">No TEKMĒ data in local storage.</li>}
            {cachesInfo && cachesInfo.names.map((n) => <li key={n} className="flex justify-between gap-2"><code className="text-ink">cache: {n}</code><span className="text-ink-3">app files and model only</span></li>)}
          </ul>
          <p className="mt-2 text-xs text-ink-3">History is {settings.history ? `on (kept ${settings.retentionDays} day(s))` : "off"}. Settings contain no message text.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => { clearHistory(); refresh(); }}><Trash2 className="h-4 w-4" aria-hidden />Delete history</Button>
            <Button variant="outline" onClick={() => { clearFeedback(); refresh(); }}><Trash2 className="h-4 w-4" aria-hidden />Delete feedback</Button>
            <Button variant="outline" onClick={async () => { clearAll(); if ("caches" in window) for (const n of await caches.keys()) await caches.delete(n); refresh(); }}><Trash2 className="h-4 w-4" aria-hidden />Delete everything</Button>
          </div>
        </Panel>
        <Panel title="Your feedback (local learning)" icon={<Database className="h-5 w-5" />}>
          <p className="text-sm text-ink-2">{fb.length} judgement(s) saved in this browser{fb.length ? `, ${fb.filter((f) => !f.correct).length} marked wrong` : ""}. Feedback never changes the deployed model. Export it and run <code>python -m ml.feedback.ingest</code>, which only prepares a review file; a person approves rows, and retraining is a separate manual step followed by the full evaluation.</p>
          <div className="mt-3 flex gap-2">
            <Button variant="outline" disabled={!fb.length} onClick={() => download("tekme-feedback.json", JSON.stringify({ format: "tekme-feedback/1", exported_at: new Date().toISOString(), redacted: true, items: fb.map((f) => ({ ...f, text: redact(f.text, settings.redact) })) }, null, 1), "application/json")}><Download className="h-4 w-4" aria-hidden />Export (redacted)</Button>
          </div>
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title="Permissions" icon={<Lock className="h-5 w-5" />}>
          <ul className="space-y-1.5 text-sm text-ink">
            <li>• No camera, microphone, contacts, location, notifications or clipboard-read permission is requested.</li>
            <li>• A web app <b>cannot read your SMS inbox</b>; you paste messages yourself.</li>
            <li>• Files you import in the Batch Scanner are read locally with the File API.</li>
            <li>• No analytics, telemetry, remote fonts or third-party scripts are included (checked at build time).</li>
          </ul>
        </Panel>
        <Panel title="Optional local Python API" icon={<ShieldCheck className="h-5 w-5" />}>
          {backend ? (
            <p className="text-sm text-ink">This page is served by the local FastAPI server, whose socket guard is <b>{backend.guard?.installed ? "installed" : "not reported"}</b> with {backend.guard?.blocked_attempts ?? 0} blocked outbound attempts. The UI still analyses messages in the browser.</p>
          ) : <p className="text-sm text-ink-2">No local API detected (expected when the app is installed or served as static files). Nothing in the UI depends on it.</p>}
          <div className="mt-3"><Note>These are software checks, not a cryptographic proof. A compromised device or browser extension could still read what you type.</Note></div>
        </Panel>
      </div>
    </div>
  );
}
