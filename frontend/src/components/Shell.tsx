import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowRight, BookOpen, ChartColumn, FileText, FlaskConical, House, Lock, Menu, MessageSquareText, MessagesSquare, Monitor,
  Moon, Search, Settings as SettingsIcon, Smartphone, Sun, X,
} from "lucide-react";
import { Wordmark } from "../brand/EvidenceMark";
import { go, useApp, type Route } from "../app/context";

export const SIDEBAR: { route: Route; label: string; icon: typeof House }[] = [
  { route: "", label: "Overview", icon: House },
  { route: "analyze", label: "Message Analyzer", icon: MessageSquareText },
  { route: "conversation", label: "Conversation Intelligence", icon: MessagesSquare },
  { route: "forensics", label: "Scam Forensics", icon: Search },
  { route: "lab", label: "Adversarial Lab", icon: FlaskConical },
  { route: "model", label: "Model Intelligence", icon: ChartColumn },
  { route: "batch", label: "Batch Scanner", icon: FileText },
  { route: "library", label: "Threat Library", icon: BookOpen },
  { route: "privacy", label: "Privacy Center", icon: Lock },
  { route: "iphone", label: "iOS Integration", icon: Smartphone },
  { route: "settings", label: "Settings", icon: SettingsIcon },
];
const TOP: { route: Route; label: string; match: Route[] }[] = [
  { route: "", label: "Home", match: [""] },
  { route: "analyze", label: "Analyze", match: ["analyze", "conversation", "batch"] },
  { route: "forensics", label: "Investigate", match: ["forensics", "library"] },
  { route: "model", label: "Model Lab", match: ["model", "lab"] },
  { route: "iphone", label: "Integrations", match: ["iphone", "privacy"] },
  { route: "about", label: "About", match: ["about", "settings"] },
];

export function ThemeToggle() {
  const { settings, update, resolvedTheme } = useApp();
  const next = settings.theme === "dark" ? "light" : settings.theme === "light" ? "system" : "dark";
  const Icon = settings.theme === "system" ? Monitor : resolvedTheme === "dark" ? Moon : Sun;
  const label = settings.theme === "system" ? `System theme (${resolvedTheme})` : `${settings.theme[0].toUpperCase()}${settings.theme.slice(1)} theme`;
  return (
    <button onClick={() => update({ theme: next })} aria-label={`${label}. Switch to ${next}.`} title={`${label} — click for ${next}`}
      className="grid h-10 w-10 place-items-center rounded-full border border-line-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink">
      <Icon className="h-[18px] w-[18px]" aria-hidden />
    </button>
  );
}

export function TopNav({ route }: { route: Route }) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [route]);
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
      <a href="#main" className="skip-link">Skip to content</a>
      <div className="mx-auto flex h-[70px] max-w-[1536px] items-center gap-4 px-4 sm:px-6 lg:px-12">
        <a href="#/" className="shrink-0 rounded-md" aria-label="TEKMĒ home"><Wordmark /></a>
        <span className="mx-2 hidden h-9 w-px bg-line-2 xl:block" aria-hidden />
        <span className="eyebrow hidden text-ink-2 xl:block">Message forensics &amp; scam detection</span>
        <nav aria-label="Primary" className="ml-auto hidden items-center gap-1 lg:flex">
          {TOP.map((t) => {
            const active = t.match.includes(route);
            return (
              <a key={t.label} href={`#/${t.route}`} aria-current={active ? "page" : undefined}
                className={`relative px-3.5 py-2 text-[0.95rem] transition-colors ${active ? "font-semibold text-ink" : "text-ink-2 hover:text-ink"}`}>
                {t.label}
                {active && <span className="absolute inset-x-3 -bottom-[13px] h-[3px] rounded-full bg-accent" aria-hidden />}
              </a>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2 lg:ml-3">
          <ThemeToggle />
          <button onClick={() => go("analyze")} className="btn-primary hidden items-center gap-2 rounded-full px-5 py-2.5 text-[0.95rem] font-semibold sm:inline-flex">
            Get Started <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
          <button className="grid h-10 w-10 place-items-center rounded-full border border-line-2 text-ink lg:hidden" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}>
            <Menu className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </div>
      {open && <MobileDrawer route={route} onClose={() => setOpen(false)} />}
    </header>
  );
}

function MobileDrawer({ route, onClose }: { route: Route; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
      <button className="absolute inset-0 bg-black/50" aria-label="Close menu" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 flex w-[min(320px,88vw)] flex-col gap-2 overflow-y-auto border-l border-line bg-bg p-4">
        <div className="mb-2 flex items-center justify-between">
          <Wordmark compact />
          <button className="grid h-10 w-10 place-items-center rounded-full border border-line-2" aria-label="Close menu" onClick={onClose} autoFocus><X className="h-5 w-5" aria-hidden /></button>
        </div>
        <SidebarLinks route={route} />
        <a href="#/about" className="mt-2 rounded-lg px-3 py-2 text-sm text-ink-2 hover:bg-surface-2">About</a>
      </div>
    </div>
  );
}

export function SidebarLinks({ route }: { route: Route }) {
  return (
    <ul className="flex flex-col gap-1">
      {SIDEBAR.map(({ route: r, label, icon: Icon }) => {
        const active = r === route;
        return (
          <li key={label}>
            <a href={`#/${r}`} aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 whitespace-nowrap rounded-[10px] px-3 py-[0.6rem] text-[0.9rem] transition-colors ${active
                ? "bg-gradient-to-r from-[#c47a3a] to-[#d99a5c] font-semibold text-[#fffaf3] shadow-[0_6px_16px_-8px_#c0844a] dark:bg-none dark:bg-[var(--t-active)] dark:text-[var(--t-active-ink)] dark:shadow-none dark:ring-1 dark:ring-inset dark:ring-[#4d3f39]"
                : "text-ink hover:bg-surface-2"}`}>
              <Icon className={`h-[1.15rem] w-[1.15rem] shrink-0 ${active ? "" : "text-ink-2"}`} strokeWidth={1.7} aria-hidden />
              {label}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

export function Sidebar({ route }: { route: Route }) {
  return (
    <nav aria-label="Modules" className="panel sticky top-[86px] hidden h-fit w-[246px] shrink-0 p-2.5 lg:block">
      <SidebarLinks route={route} />
    </nav>
  );
}

export function PageHeader({ eyebrow, title, children, actions }: { eyebrow: string; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6">
      <div className="eyebrow text-accent">{eyebrow}</div>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-[2.4rem] font-semibold leading-tight text-ink sm:text-[2.8rem]">{title}</h1>
        {actions}
      </div>
      {children && <p className="mt-2 max-w-3xl text-[0.97rem] leading-relaxed text-ink-2">{children}</p>}
      <div className="meander mt-5" aria-hidden />
    </div>
  );
}

export function Footer() {
  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto flex max-w-[1536px] flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-ink-3 sm:px-6 lg:px-12">
        <span>TEKMĒ · Evidence over instinct. · Tinyverse PS-01 · Divya Ramji (1MS24CI044)</span>
        <span>Analysis runs on this device. No message leaves it.</span>
      </div>
    </footer>
  );
}
