import { useEffect, useState } from "react";
import { Activity, BookOpen, FlaskConical, Lock, ScanSearch, ShieldCheck } from "lucide-react";
import { api } from "./services/api";
import Analyzer from "./pages/Analyzer";
import MutationLab from "./pages/MutationLab";
import Diagnostics from "./pages/Diagnostics";
import Privacy from "./pages/Privacy";
import About from "./pages/About";

const TABS = [
  { id: "analyzer", label: "Analyzer", icon: ScanSearch },
  { id: "lab", label: "Mutation Lab", icon: FlaskConical },
  { id: "diagnostics", label: "Model Diagnostics", icon: Activity },
  { id: "privacy", label: "Privacy Center", icon: Lock },
  { id: "about", label: "About", icon: BookOpen },
] as const;
type TabId = (typeof TABS)[number]["id"];

const tabFromHash = (): TabId => {
  const h = window.location.hash.replace(/^#/, "").split("?")[0];
  return (TABS.find((t) => t.id === h)?.id ?? "analyzer") as TabId;
};

export default function App() {
  const [tab, setTab] = useState<TabId>(tabFromHash);
  const [labSeed, setLabSeed] = useState<string | null>(null);
  const [health, setHealth] = useState<"checking" | "ok" | "degraded" | "down">("checking");

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    let alive = true;
    const check = () => api.health().then((h) => alive && setHealth(h.model_loaded ? "ok" : "degraded")).catch(() => alive && setHealth("down"));
    check();
    const id = setInterval(check, 15000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const go = (id: TabId) => { window.location.hash = id; setTab(id); };
  const status = { checking: ["bg-ink-3", "Connecting…"], ok: ["bg-safe", "Local model ready"], degraded: ["bg-warn", "Model not loaded"], down: ["bg-scam", "Backend offline"] }[health];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-navy/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg border border-accent/30 bg-accent/10 p-1.5"><ShieldCheck className="h-5 w-5 text-accent" aria-hidden /></div>
            <div>
              <div className="text-[17px] font-bold tracking-tight text-ink">SCAMPRINT</div>
              <div className="-mt-0.5 text-[11px] text-ink-3">Offline scam message detector</div>
            </div>
          </div>
          <nav aria-label="Sections" className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto scroll-thin md:order-none md:w-auto">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => go(id)} aria-current={tab === id ? "page" : undefined}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${tab === id ? "bg-surface-3 text-ink" : "text-ink-3 hover:bg-surface-2 hover:text-ink-2"}`}>
                <Icon className="h-4 w-4" aria-hidden />{label}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 text-xs text-ink-2" role="status">
            <span className={`h-2 w-2 rounded-full ${status[0]}`} aria-hidden />{status[1]}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {health === "down" && (
          <div role="alert" className="mb-6 rounded-lg border border-scam/40 bg-scam-bg p-4 text-sm text-ink">
            The local backend is not reachable. Start it with <code className="rounded bg-navy px-1.5 py-0.5">.\run.ps1</code> (or <code className="rounded bg-navy px-1.5 py-0.5">python -m backend.main</code>).
          </div>
        )}
        <div hidden={tab !== "analyzer"}><Analyzer onSendToLab={(t) => { setLabSeed(t); go("lab"); }} /></div>
        {tab === "lab" && <MutationLab seedText={labSeed} />}
        {tab === "diagnostics" && <Diagnostics />}
        {tab === "privacy" && <Privacy />}
        {tab === "about" && <About />}
      </main>
      <footer className="mx-auto max-w-7xl px-4 pb-8 pt-2 text-xs text-ink-3 sm:px-6">All analysis runs locally on this device · Tinyverse PS-01 · Divya Ramji (1MS24CI044)</footer>
    </div>
  );
}
