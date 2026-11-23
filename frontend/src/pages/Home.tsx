import { ArrowRight, BookOpen, CircleCheck, CirclePlay, Fingerprint, Gauge, Layers, Lock, ScanSearch, Shield, Shuffle, Smartphone, Swords, Waypoints, Zap, Columns3, Wifi } from "lucide-react";
import { go, useApp } from "../app/context";
import { Sidebar } from "../components/Shell";
import { AnalyzerPair } from "../components/AnalyzerWidget";
import { StatusChip } from "../components/ui";
import dark720 from "../assets/athena/athena-dark-720.webp";
import dark1200 from "../assets/athena/athena-dark-1200.webp";
import dark1774 from "../assets/athena/athena-dark-1774.webp";
import light720 from "../assets/athena/athena-light-720.webp";
import light1200 from "../assets/athena/athena-light-1200.webp";
import light1774 from "../assets/athena/athena-light-1774.webp";

const ART = {
  dark: { src: dark1774, set: `${dark720} 720w, ${dark1200} 1200w, ${dark1774} 1774w` },
  light: { src: light1774, set: `${light720} 720w, ${light1200} 1200w, ${light1774} 1774w` },
};

function LaurelIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden>
      {[1, -1].map((side) => {
        // leaves placed along an arc from the bottom centre up each side
        const leaves = [0, 1, 2, 3, 4].map((i) => {
          const a = (Math.PI / 180) * (100 + i * 32);
          const cx = 20 + side * Math.cos(a) * -13, cy = 21 + Math.sin(a) * 13;
          const rot = side * (i * 32 + 10);
          return <path key={i} d={`M${cx} ${cy} q ${side * 3.2} -2.6 ${side * 1.2} -6 q ${-side * 3} 2.2 ${-side * 1.2} 6 z`} transform={`rotate(${rot} ${cx} ${cy})`} />;
        });
        return <g key={side}><path d={side > 0 ? "M17 35 C 8 31 5 20 9 9" : "M23 35 C 32 31 35 20 31 9"} />{leaves}</g>;
      })}
    </svg>
  );
}

const STRIP = {
  dark: [
    { icon: Shield, title: "Trustworthy Detection", sub: "Calibrated, explainable verdicts" },
    { icon: Layers, title: "Evidence-Driven", sub: "Explainable & verifiable" },
    { icon: Zap, title: "Privacy-First", sub: "Runs fully on-device" },
    { icon: Smartphone, title: "iOS SMS Filter", sub: "Source in development · not verified" },
    { icon: LaurelIcon, title: "Real-World Ready", sub: "Robustness-tested on 11 disguises" },
  ],
  light: [
    { icon: Shield, title: "Privacy First", sub: "On-device analysis" },
    { icon: Layers, title: "Multi-Modal", sub: "Text · URL · UPI · Sender" },
    { icon: Zap, title: "Offline Ready", sub: "Works without a network" },
    { icon: Gauge, title: "Evidence-Based", sub: "Tactics, indicators & sources" },
    { icon: LaurelIcon, title: "Trustworthy AI", sub: "Calibrated and explainable" },
  ],
};

function Hero() {
  const { resolvedTheme: t } = useApp();
  const art = ART[t];
  return (
    <section className="relative overflow-hidden border-b border-line" aria-labelledby="hero-title" style={{ backgroundImage: "var(--t-hero-glow)" }}>
      <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[62%] lg:block">
        <img src={art.src} srcSet={art.set} sizes="62vw" alt="Athena guardian holding a spear and an owl shield before a classical temple"
          className="hero-art h-full w-full object-cover" style={{ objectPosition: "50% 18%" }} fetchPriority="high" />
      </div>
      <div className="relative mx-auto max-w-[1536px] px-4 pb-8 pt-8 sm:px-6 lg:min-h-[350px] lg:px-12 lg:pb-10 lg:pt-9">
        <div className="max-w-[640px]">
          {t === "dark" ? (
            <h1 id="hero-title">
              <span className="block font-brand text-[clamp(3.4rem,8vw,6.1rem)] font-semibold leading-[0.95] tracking-[0.04em] text-ink">TEKMĒ</span>
              <span className="mt-2 block font-display text-[clamp(2rem,4.4vw,3.15rem)] font-semibold italic leading-tight text-accent">Evidence over instinct.</span>
            </h1>
          ) : (
            <h1 id="hero-title" className="font-display text-[clamp(3.2rem,7vw,5.5rem)] font-bold leading-[0.9] tracking-[-0.02em] text-ink">
              Evidence over<br /><span className="italic text-[#a35a26]">instinct.</span>
            </h1>
          )}
          <p className="mt-4 max-w-[560px] text-[clamp(1.02rem,1.45vw,1.2rem)] leading-snug text-ink">
            {t === "dark"
              ? "An on-device platform for scam detection, message forensics and evidence-based explanation — built to uncover, explain and verify."
              : "An evidence-based platform that detects scams, analyses message intent, and uncovers the tactics behind digital fraud."}
          </p>
          <div className="mt-6 flex flex-wrap gap-4">
            <button onClick={() => go("analyze")} className="btn-primary inline-flex items-center gap-2.5 rounded-[10px] px-6 py-3 text-[1.02rem] font-semibold">
              Analyze a Message <ArrowRight className="h-5 w-5" aria-hidden />
            </button>
            <a href="#how" className="inline-flex items-center gap-2.5 rounded-[10px] border border-line-2 px-6 py-3 text-[1.02rem] font-medium text-ink hover:bg-surface-2">
              <CirclePlay className="h-5 w-5" aria-hidden /> See How It Works
            </a>
          </div>
        </div>
        <img src={ART[t].set.split(", ")[0].split(" ")[0]} alt="" aria-hidden className="hero-art mt-8 w-full rounded-xl object-cover lg:hidden" style={{ aspectRatio: "16/9", objectPosition: "50% 20%" }} />
      </div>
    </section>
  );
}

function Strip() {
  const { resolvedTheme } = useApp();
  return (
    <div className="mx-auto max-w-[1536px] px-4 sm:px-6 lg:px-12">
      <ul className="grid grid-cols-2 gap-y-5 py-5 sm:grid-cols-3 lg:grid-cols-5 lg:divide-x lg:divide-line-2">
        {STRIP[resolvedTheme].map(({ icon: Icon, title, sub }) => (
          <li key={title} className="flex items-center gap-4 px-2 lg:justify-center lg:px-4">
            <Icon className="h-9 w-9 shrink-0 text-accent" strokeWidth={1.5} />
            <div><div className="font-semibold text-ink">{title}</div><div className="text-[0.82rem] text-ink-2">{sub}</div></div>
          </li>
        ))}
      </ul>
    </div>
  );
}

const MODULES = [
  { icon: Fingerprint, title: "Scam DNA", sub: "Tactics, patterns & intent", route: "analyze" as const },
  { icon: Waypoints, title: "Evidence Map", sub: "Key indicators & sources", route: "forensics" as const },
  { icon: Shuffle, title: "Counterfactual", sub: "What changes the verdict", route: "lab" as const },
  { icon: Swords, title: "Model Arena", sub: "Compare model outputs", route: "model" as const },
  { icon: BookOpen, title: "Threat Library", sub: "Local, versioned patterns", route: "library" as const },
];

function PhoneConcept() {
  return (
    <div className="relative mx-auto w-[230px] rounded-[38px] border-[7px] border-[#1d1310] bg-[#fbfaf8] p-3 pt-6 shadow-xl dark:border-[#0b0706]" aria-hidden>
      <div className="absolute left-1/2 top-2 h-4 w-20 -translate-x-1/2 rounded-full bg-[#1d1310]" />
      <div className="flex justify-between px-1 text-[10px] font-semibold text-[#111]"><span>9:41</span><Wifi className="h-3 w-3" /></div>
      <div className="mt-3 px-1 text-[17px] font-bold text-[#111]">Messages</div>
      <div className="mt-2 flex gap-1.5 text-[9px]">
        <span className="rounded-full bg-[#eee] px-2 py-1 text-[#333]">Known Senders</span>
        <span className="rounded-full bg-[#c47a3a] px-2 py-1 font-semibold text-white">Unknown Senders</span>
      </div>
      <div className="mt-3 rounded-xl bg-[#f3efe9] p-2 text-[10px] text-[#222]">
        <div className="flex justify-between"><b>Unknown sender</b><span className="text-[#777]">concept</span></div>
        <div className="mt-0.5 text-[#555]">A filter extension can only sort a message into a folder…</div>
      </div>
      <div className="mt-6 text-center text-[9px] text-[#888]">Illustration only — not a screenshot</div>
    </div>
  );
}

export default function Home() {
  return (
    <>
      <Hero />
      <Strip />
      <div className="mx-auto max-w-[1536px] px-4 pb-6 sm:px-5" id="main" tabIndex={-1}>
        <div className="flex items-start gap-5">
          <Sidebar route="" />
          <div className="min-w-0 flex-1 space-y-5">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-stretch"><AnalyzerPair /></div>
            <ul className="panel grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 xl:grid-cols-5" id="how" aria-label="Modules">
              {MODULES.map(({ icon: Icon, title, sub, route }) => (
                <li key={title}>
                  <a href={`#/${route}`} className="flex h-full items-center gap-3.5 rounded-xl border border-line bg-surface-2 px-4 py-4 transition-colors hover:border-accent/60">
                    <Icon className="h-9 w-9 shrink-0 text-accent" strokeWidth={1.4} aria-hidden />
                    <span><span className="block font-semibold text-ink">{title}</span><span className="block text-[0.8rem] text-ink-2">{sub}</span></span>
                  </a>
                </li>
              ))}
            </ul>
            <section className="panel relative overflow-hidden p-6 sm:p-8" aria-labelledby="iphone-title">
              <div className="pointer-events-none absolute -right-24 -top-24 h-[340px] w-[340px] rounded-full bg-accent-2/25 dark:bg-accent-2/30" aria-hidden />
              <div className="relative grid items-center gap-8 md:grid-cols-[230px_1fr]">
                <PhoneConcept />
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 id="iphone-title" className="font-display text-[2.3rem] font-semibold text-ink">TEKMĒ for iPhone</h2>
                    <StatusChip status="in_development" />
                  </div>
                  <p className="mt-2 max-w-2xl text-[0.98rem] text-ink-2">The installable web app works on iPhone today: open it once, add it to your Home Screen, then paste messages — analysis runs inside Safari, offline. Automatic filtering needs a native Message Filter extension, which is in development and has not been built or tested on a device.</p>
                  <ul className="mt-4 space-y-2 text-[0.93rem] text-ink">
                    <li className="flex gap-2.5"><CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-safe" aria-hidden />Web app: same on-device engine, verified against the Python model</li>
                    <li className="flex gap-2.5"><Columns3 className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden />Native source: SwiftUI host app + IdentityLookup Message Filter extension</li>
                    <li className="flex gap-2.5"><Lock className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />Apple only lets filters see SMS from unknown senders — never iMessages or contacts</li>
                    <li className="flex gap-2.5"><ScanSearch className="mt-0.5 h-4 w-4 shrink-0 text-uncertain" aria-hidden />Building it needs a Mac with Xcode; device install is not verified</li>
                  </ul>
                  <a href="#/iphone" className="mt-5 inline-flex items-center gap-2 font-semibold text-accent hover:underline">Read the honest status <ArrowRight className="h-4 w-4" aria-hidden /></a>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
