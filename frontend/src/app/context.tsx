import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Engine } from "../engine/engine";
import { loadIntel, type Intel } from "../analysis/intel";
import { loadSettings, saveSettings, type Settings } from "../analysis/store";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = Record<string, any>;
interface Ctx {
  engine: Engine | null; intel: Intel | null; status: "loading" | "ready" | "error"; error: string | null;
  settings: Settings; update: (p: Partial<Settings>) => void; resolvedTheme: "dark" | "light";
  metrics: Json | null; parity: Json | null; retry: () => void;
}
const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => { const c = useContext(AppCtx); if (!c) throw new Error("AppProvider missing"); return c; };

const systemDark = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches;

export function applyDocumentSettings(s: Settings) {
  const root = document.documentElement;
  const theme = s.theme === "system" ? (systemDark() ? "dark" : "light") : s.theme;
  root.dataset.theme = theme;
  root.dataset.motion = s.motion;
  root.dataset.contrast = s.highContrast ? "high" : "normal";
  root.style.setProperty("--text-scale", String(s.textScale / 100));
  root.lang = s.lang === "hinglish" ? "hi-Latn" : "en";
  return theme as "dark" | "light";
}

/** Saved settings; a ?theme=dark|light query (used for screenshots and demos) overrides the saved theme. */
function initialSettings(): Settings {
  const s = loadSettings();
  const q = typeof location !== "undefined" ? new URLSearchParams(location.search).get("theme") : null;
  return q === "dark" || q === "light" ? { ...s, theme: q } : s;
}

async function getJson(url: string): Promise<Json | null> {
  try { const r = await fetch(url); return r.ok ? await r.json() : null; } catch { return null; }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [resolvedTheme, setResolved] = useState<"dark" | "light">(() => applyDocumentSettings(initialSettings()));
  const [engine, setEngine] = useState<Engine | null>(null);
  const [intel, setIntel] = useState<Intel | null>(null);
  const [status, setStatus] = useState<Ctx["status"]>("loading");
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Json | null>(null);
  const [parity, setParity] = useState<Json | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setStatus("loading");
    Promise.all([Engine.load(), loadIntel().catch(() => null)])
      .then(([e, i]) => { if (alive) { setEngine(e); setIntel(i); setStatus("ready"); } })
      .catch((e: Error) => { if (alive) { setError(e.message); setStatus("error"); } });
    getJson("/data/metrics.json").then((m) => alive && setMetrics(m));
    getJson("/data/parity_report.json").then((m) => alive && setParity(m));
    return () => { alive = false; };
  }, [attempt]);

  useEffect(() => {
    setResolved(applyDocumentSettings(settings));
    saveSettings(settings);
    if (settings.theme !== "system" || typeof matchMedia === "undefined") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => setResolved(applyDocumentSettings(settings));
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [settings]);

  const update = useCallback((p: Partial<Settings>) => setSettings((s) => ({ ...s, ...p })), []);
  const value = useMemo(() => ({ engine, intel, status, error, settings, update, resolvedTheme, metrics, parity, retry: () => setAttempt((a) => a + 1) }),
    [engine, intel, status, error, settings, update, resolvedTheme, metrics, parity]);
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

// ------------------------------------------------------------------ hash router
export type Route = "" | "analyze" | "conversation" | "forensics" | "lab" | "model" | "batch" | "library" | "privacy" | "iphone" | "settings" | "about";
export const ROUTES: Route[] = ["", "analyze", "conversation", "forensics", "lab", "model", "batch", "library", "privacy", "iphone", "settings", "about"];
export function parseHash(): { route: Route; params: URLSearchParams } {
  const h = window.location.hash.replace(/^#\/?/, "");
  const [path, q = ""] = h.split("?");
  const route = (ROUTES.includes(path as Route) ? path : "") as Route;
  return { route, params: new URLSearchParams(q) };
}
export function useRoute() {
  const [r, setR] = useState(parseHash);
  useEffect(() => {
    const on = () => { setR(parseHash()); window.scrollTo({ top: 0 }); };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return r;
}
export const go = (route: Route, params?: Record<string, string>) => {
  const q = params ? "?" + new URLSearchParams(params).toString() : "";
  window.location.hash = `/${route}${q}`;
};
