import { useEffect, useState } from "react";
import { BookOpen, Boxes, Database, TriangleAlert } from "lucide-react";
import { api, type Metrics } from "../services/api";
import { Card } from "../components/ui";

const ENGINES = [
  ["Preprocessing", "Keeps the original text, extracts links / numbers / UPI IDs first, then undoes look-alike characters, digit swaps (acc0unt), spaced letters (K Y C), invisible characters and SMS abbreviations, and adds English glosses for Hinglish and Hindi terms."],
  ["Semantic engine", "Word + character TF-IDF with logistic regression, chosen over linear SVM and Complement Naive Bayes on validation data."],
  ["Scam DNA engine", "Rules for 10 manipulation tactics (urgency, threats, impersonation, rewards, sensitive-data requests, payments, links, job/investment lures, emotional pressure, secrecy) in English and Hinglish, with negation handling."],
  ["Trust & risk signals", "Offline link analysis (shorteners, IP links, unusual endings, look-alike and brand-mismatch domains via a local list), phone / UPI / money / OTP structure, obfuscation. No URL is ever visited."],
  ["Genuine-message protection", "Recognises OTP, transaction, delivery, reminder and chat shapes plus safety advice, a specialist model trained only on transactional messages, and a conflict detector for genuine-looking messages carrying malicious instructions."],
  ["Calibrated fusion", "Standardised logistic regression over all engines, trained on out-of-fold scores and calibrated on held-out validation data (sigmoid or isotonic, chosen by cross-validated Brier score)."],
  ["Category classifier", "Multinomial logistic regression over text and tactics; falls back to Other when no specific category is well supported."],
  ["Explainability", "Exact per-feature contributions of the fusion model plus highlighted tactic and signal evidence, composed into plain-language sentences locally."],
];

export default function About() {
  const [info, setInfo] = useState<Metrics | null>(null);
  useEffect(() => { api.info().then(setInfo).catch(() => setInfo(null)); }, []);
  return (
    <div className="space-y-6">
      <Card title="About SCAMPRINT" icon={<BookOpen className="h-4 w-4" />}>
        <p className="text-[15px] leading-7 text-ink-2">SCAMPRINT is an explainable, privacy-first scam-message detector built for <span className="text-ink">Tinyverse — Problem Statement 01: On-Device Scam Message Detector</span>. It classifies one SMS or WhatsApp message as <span className="font-semibold text-scam">SCAM</span> or <span className="font-semibold text-safe">SAFE</span>, assigns a scam category, and reports calibrated confidence — entirely offline on an ordinary laptop. Rather than relying on keywords alone, it looks for the <span className="text-ink">manipulation strategy</span> behind a message and actively protects genuine OTPs, bank alerts and delivery updates from false alarms.</p>
        <p className="mt-3 text-sm text-ink-3">Developer: Divya Ramji · USN 1MS24CI044</p>
      </Card>
      <Card title="Architecture" icon={<Boxes className="h-4 w-4" />}>
        <div className="grid gap-3 md:grid-cols-2">{ENGINES.map(([h, d]) => <div key={h} className="rounded-lg border border-line bg-surface-2 p-4"><div className="font-semibold text-ink">{h}</div><p className="mt-1 text-sm text-ink-3">{d}</p></div>)}</div>
        <p className="mt-4 text-sm text-ink-3">Stack: Python · scikit-learn · FastAPI (local, 127.0.0.1) · React · TypeScript · Vite · Tailwind CSS · Lucide icons. Charts are hand-drawn SVG.</p>
      </Card>
      {info && (
        <Card title="Loaded model" icon={<Database className="h-4 w-4" />}>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {[["Version", info.model_version], ["Trained", info.trained_at], ["Training rows (incl. augmentation)", info.train_rows?.toLocaleString()], ["Augmented rows (train only)", info.train_augmented_rows?.toLocaleString()],
              ["Validation rows", info.val_rows?.toLocaleString()], ["Fusion features", info.feature_count], ["Calibration", info.fusion?.calibration], ["Decision threshold", info.threshold], ["Bundle size", `${info.bundle_size_mb} MB`], ["scikit-learn", info.sklearn]].map(([k, v]) => (
              <div key={k as string} className="flex justify-between gap-4 border-b border-line/60 py-1"><dt className="text-ink-3">{k}</dt><dd className="text-right text-ink-2">{String(v ?? "—")}</dd></div>))}
          </dl>
          <p className="mt-3 text-xs text-ink-3">Data: UCI SMS Spam Collection (ham only), Scam Shield SMS (IMC 2025 smishing reports, Mishra &amp; Soni, synthetic service messages), Indian Scam SMS synthetic-audited (Hinglish / Hindi / regional). All CC BY 4.0. External Test B used only for evaluation.</p>
        </Card>
      )}
      <Card title="Limitations" icon={<TriangleAlert className="h-4 w-4" />}>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-2">
          <li>Hinglish, Hindi and regional training data is small and synthetic; robustness to real code-mixed scams is less certain than for English.</li>
          <li>Genuine service messages in the data are largely synthetic; real-world false-positive rates may differ from the reported test numbers.</li>
          <li>Category labels for some public scam reports come from keyword rules; category evaluation excludes those rows.</li>
          <li>Link checks are lexical and use a small local list of official domains; a compromised legitimate site will not be detected.</li>
          <li>Scams evolve. Without periodic retraining, accuracy on new scam styles will decline.</li>
          <li>SCAMPRINT supports a decision; when in doubt, contact the organisation through its official app or number.</li>
        </ul>
      </Card>
    </div>
  );
}
