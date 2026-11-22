import { useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, HardDrive, Lock, RefreshCw, ScanSearch, ServerCog, WifiOff, XCircle } from "lucide-react";
import { api, ApiError, type Metrics } from "../services/api";
import { Badge, Button, Card, ErrorBox, Spinner } from "../components/ui";

function Check({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) {
  return (
    <li className="flex items-start gap-3 py-2">
      {ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-safe" aria-label="pass" /> : <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-scam" aria-label="fail" />}
      <div><div className="text-sm font-medium text-ink">{label}</div>{detail && <div className="text-xs text-ink-3">{detail}</div>}</div>
    </li>
  );
}

export default function Privacy() {
  const [s, setS] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [probe, setProbe] = useState<{ ms: number; verdict: string; guardBefore: number; guardAfter: number; external: number } | null>(null);
  const [probing, setProbing] = useState(false);
  const browserOnline = typeof navigator !== "undefined" ? navigator.onLine : true;

  const load = () => { setError(null); api.privacy().then(setS).catch((e) => setError(e instanceof ApiError ? e.message : "Failed")); };
  useEffect(load, []);

  async function runProbe() {
    setProbing(true);
    try {
      const before = await api.privacy();
      const t0 = performance.now();
      const r = await api.predict("Your KYC is pending. Update now at http://kyc-check.example or your account will be blocked.");
      const ms = performance.now() - t0;
      const after = await api.privacy();
      setS(after);
      setProbe({ ms, verdict: r.verdict, guardBefore: before.network_guard.blocked_outbound_attempts, guardAfter: after.network_guard.blocked_outbound_attempts, external: after.live_external_connections.filter((c: Metrics) => c.remote).length });
    } catch (e) { setError(e instanceof ApiError ? e.message : "Probe failed"); }
    finally { setProbing(false); }
  }

  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!s) return <Card><div className="py-16 text-center"><Spinner label="Checking local privacy status…" /></div></Card>;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Card title="Offline readiness" icon={<Lock className="h-4 w-4" />} action={<Button variant="ghost" onClick={load}><RefreshCw className="h-4 w-4" />Refresh</Button>}>
          <ul className="divide-y divide-line/60">
            <Check ok={s.model_loaded} label="Model loaded from local disk" detail={`Inference location: ${s.inference_location}`} />
            <Check ok={s.all_model_files_local} label="All model files present locally" detail={`${s.model_files.length} files, verified by SHA-256 below`} />
            <Check ok={s.network_guard.active} label="Outbound network guard active" detail={`The backend process refuses connections to any non-loopback address · blocked attempts so far: ${s.network_guard.blocked_outbound_attempts}`} />
            <Check ok={s.no_external_connections_now} label="No external connections held by the backend right now" detail="Live socket list of the backend process (psutil)" />
            <Check ok={s.bound_to_loopback} label={`API bound to ${s.server_bind_host}`} detail="Not reachable from other devices on the network" />
            <Check ok={!s.raw_message_logging} label="Message text is not logged" detail={s.message_storage} />
            <Check ok={s.third_party_services.length === 0} label="No third-party services, analytics or telemetry" detail="The UI loads no remote fonts, scripts or images" />
          </ul>
        </Card>
        <Card title="Live offline test" icon={<WifiOff className="h-4 w-4" />}>
          <p className="text-sm text-ink-2">Turn off Wi-Fi / unplug the network, then run a real prediction. Browser network status: {browserOnline ? <Badge tone="warn">online</Badge> : <Badge tone="safe">offline</Badge>}</p>
          <div className="mt-4"><Button onClick={runProbe} disabled={probing}>{probing ? <Spinner label="Testing" /> : <><ScanSearch className="h-4 w-4" />Run offline prediction test</>}</Button></div>
          {probe && (
            <ul className="mt-4 space-y-1 text-sm fade-in">
              <Check ok label={`Prediction returned: ${probe.verdict} in ${probe.ms.toFixed(0)} ms`} detail="Served by the local backend over the loopback interface" />
              <Check ok={probe.guardAfter === probe.guardBefore} label="No outbound connection attempted during the prediction" detail={`guard counter ${probe.guardBefore} → ${probe.guardAfter}`} />
              <Check ok={probe.external === 0} label="No external sockets open after the prediction" />
              {browserOnline && <li className="flex gap-2 pt-1 text-xs text-ink-3"><CircleAlert className="h-4 w-4 shrink-0 text-warn" />Your device is online, so this shows no outbound traffic was attempted — disconnect and rerun for a true offline demonstration.</li>}
            </ul>
          )}
          <p className="mt-4 text-xs text-ink-3">Note: requests from this page to <code>127.0.0.1</code> are local loopback traffic — they never leave the computer.</p>
        </Card>
      </div>

      <Card title="Local model storage" icon={<HardDrive className="h-4 w-4" />}>
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-ink-3"><th className="py-1 font-medium">File</th><th className="font-medium">Path</th><th className="text-right font-medium">Size</th><th className="pl-4 font-medium">SHA-256</th></tr></thead>
            <tbody>{s.model_files.map((f: Metrics) => (
              <tr key={f.name} className="border-t border-line/60 text-ink-2"><td className="py-2">{f.name}</td><td className="font-mono text-xs">{f.path}</td><td className="text-right tabular-nums">{f.present ? `${(f.size_bytes / 1e6).toFixed(2)} MB` : "missing"}</td><td className="pl-4 font-mono text-xs text-ink-3">{f.sha256?.slice(0, 16)}…</td></tr>))}</tbody>
          </table>
        </div>
      </Card>

      <Card title="Privacy architecture" icon={<ServerCog className="h-4 w-4" />}>
        <ol className="grid gap-3 text-sm md:grid-cols-4">
          {[["1. Browser", "You paste a message into this page, which is served from your own computer."], ["2. Loopback API", "The text travels to 127.0.0.1:8000 — the loopback interface, never the internet."], ["3. Local models", "Preprocessing, rule engines and the trained scikit-learn models run in memory on the CPU."], ["4. Discarded", "The result returns to the page. Nothing is stored or logged; links are never visited."]].map(([h, d]) => (
            <li key={h} className="rounded-lg border border-line bg-surface-2 p-4"><div className="font-semibold text-ink">{h}</div><p className="mt-1 text-ink-3">{d}</p></li>
          ))}
        </ol>
        <p className="mt-4 text-xs text-ink-3">{s.limitations} This is an observable software test, not a cryptographic proof.</p>
      </Card>
    </div>
  );
}
