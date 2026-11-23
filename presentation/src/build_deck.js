// TEKMĒ — Tinyverse PS-01 pitch deck generator (Title + 6 slides, 16:9, fully editable).
// Structure follows "PPT Format.pdf" exactly. Every number is read from the repository's own reports at build time:
//   reports/metrics.json, reports/web_performance.json, reports/parity_report.json, reports/dataset_report.json,
//   frontend/public/model/model.bin (file size). Nothing is typed in by hand.
// Run from presentation/:  node src/prepare_assets.js → powershell -File src/render_wordmarks.ps1 → node src/build_deck.js
const fs = require("fs");
const path = require("path");
const pptxgen = require("pptxgenjs");
const { applyTheme } = require("./apply_theme.js");

const ROOT = path.resolve(__dirname, "..", "..");
const A = (f) => path.resolve(__dirname, "..", "assets", "build", f);
const OUT = path.resolve(__dirname, "..", "TEKME_Tinyverse_Final_Presentation.pptx");
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf-8"));

// ---------- verified facts ----------
const M = readJson("reports/metrics.json");
const WEB = readJson("reports/web_performance.json");
const PAR = readJson("reports/parity_report.json");
const DS = readJson("reports/dataset_report.json");
const MODEL_MB = fs.statSync(path.join(ROOT, "frontend/public/model/model.bin")).size / 1e6;
const fx = (v, d) => (v + 1e-9).toFixed(d);
const pct = (v) => `${fx(v * 100, 1)}%`;
const int = (n) => n.toLocaleString("en-IN");
const F = {
  acc: pct(M.test.accuracy), n: int(M.test.n), prec: pct(M.test.precision), rec: pct(M.test.recall),
  f1: fx(M.test.f1, 3), auc: fx(M.test.roc_auc, 3), ece: fx(M.test.ece_scam_prob, 3), fpr: pct(M.test.false_positive_rate),
  otpN: M.subsets.genuine_otp.n, otpFlag: Math.round(M.subsets.genuine_otp.flagged_as_scam * M.subsets.genuine_otp.n),
  tbAcc: pct(M.test_b.accuracy), tbN: M.test_b.n, tbF1: fx(M.test_b.f1, 3), hardAcc: pct(M.test_b_by_difficulty.hard.accuracy), hardN: M.test_b_by_difficulty.hard.n,
  advAcc: pct(M.adversarial_overall.accuracy), advN: int(M.adversarial_overall.n),
  advTypes: Object.keys(M.adversarial).filter((k) => k !== "unmutated_baseline").length,
  catF1: fx(M.category.macro_f1, 3), catN: int(M.category.n_gold_scams),
  p50: `${fx(WEB.full_predict_ms.p50, 1)} ms`, modelMB: `${fx(MODEL_MB, 1)} MB`,
  parN: int(PAR.n_messages), parVerdict: int(Math.round(PAR.agreement.verdict * PAR.n_messages)),
  rows: int(DS.final_total), sources: Object.keys(DS.loaded).length, synth: `${Math.round(DS.synthetic_share * 100)}%`,
};
const chartData = [
  { label: `Held-out test (n ${F.n})`, v: M.test.accuracy },
  { label: `Disguised messages (n ${F.advN})`, v: M.adversarial_overall.accuracy },
  { label: `External Test B (n ${F.tbN})`, v: M.test_b.accuracy },
  { label: `Test B hard subset (n ${F.hardN})`, v: M.test_b_by_difficulty.hard.accuracy },
];

// ---------- design tokens (from frontend/src/styles/index.css) ----------
const K = {
  ivory: "F7F3EE", surface: "FFFCF8", surface2: "F8EFE4", tint: "F3E2CF", champagne: "EACEAA", line: "E6D6C2", line2: "D4B998",
  espresso: "34150F", ink2: "573426", ink3: "74513F", bronze: "85431E", whiskey: "D39858",
  dBg: "111010", dCard: "201B1A", dCard2: "292321", dLine: "443A36", dInk: "F0E8E1", dInk2: "B8ACA5",
  dBronze: "A78A78", dCopper: "805B4C", dTag: "C9AD99", scam: "B42318", scamBg: "FBE7E3", safe: "1B6E43", coral: "D9766C",
};
const THEME = {
  name: "TEKME Editorial", headFontFace: "Georgia", bodyFontFace: "Calibri",
  colors: { dk1: K.espresso, lt1: K.surface, dk2: K.dBg, lt2: K.ivory, accent1: K.bronze, accent2: K.whiskey,
    accent3: K.champagne, accent4: K.dBronze, accent5: K.safe, accent6: K.scam, hlink: K.bronze, folHlink: K.ink2 },
};
const HEAD = "+mj-lt"; // theme heading font (Georgia)

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5 in
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
pres.title = "TEKMĒ — Evidence over instinct.";
pres.subject = "Tinyverse Problem Statement 01 — On-Device Scam Message Detector";
pres.author = "Divya Ramji";

// ---------- layouts ----------
const WM_RATIO = 878 / 209; // wordmark PNG aspect
const TAG_RATIO = 1361 / 127;
const header = (dark) => [
  { image: { x: 0.6, y: 0.4, w: 0.3, h: 0.3, path: A(dark ? "mark_dark.png" : "mark_light.png") } },
  { image: { x: 1.0, y: 0.455, w: 0.19 * WM_RATIO, h: 0.19, path: A(dark ? "wm_tekme_dark.png" : "wm_tekme_light.png") } },
  { text: { text: "TINYVERSE  ·  PROBLEM STATEMENT 01", options: { x: 7.73, y: 0.4, w: 5.0, h: 0.3, align: "right", valign: "middle",
    fontSize: 9, bold: true, charSpacing: 2, color: dark ? K.dBronze : K.ink3, margin: 0 } } },
  { text: { text: "TEKMĒ  ·  Evidence over instinct.  ·  Divya Ramji (1MS24CI044)", options: { x: 0.6, y: 7.0, w: 7, h: 0.25, fontSize: 9,
    color: dark ? K.dInk2 : K.ink3, margin: 0, valign: "middle" } } },
  { placeholder: { options: { name: "eyebrow", type: "body", x: 0.6, y: 0.98, w: 9, h: 0.28, fontSize: 10.5, bold: true, charSpacing: 3,
    color: dark ? K.dTag : K.bronze, margin: 0, valign: "middle" }, text: "" } },
  { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 1.26, w: 12.13, h: 0.62, fontSize: 30, color: dark ? K.dInk : K.espresso,
    margin: 0, valign: "middle", align: "left" }, text: "" } },
];
pres.defineSlideMaster({ title: "TEKME_DARK_TITLE", background: { color: K.dBg }, objects: [] });
pres.defineSlideMaster({ title: "TEKME_LIGHT", background: { color: K.ivory }, objects: header(false),
  slideNumber: { x: 12.23, y: 7.0, w: 0.5, h: 0.25, fontSize: 9, color: K.ink3, align: "right" } });
pres.defineSlideMaster({ title: "TEKME_DARK", background: { color: K.dBg }, objects: header(true),
  slideNumber: { x: 12.23, y: 7.0, w: 0.5, h: 0.25, fontSize: 9, color: K.dInk2, align: "right" } });

// ---------- helpers ----------
const shadow = () => ({ type: "outer", color: K.espresso, opacity: 0.1, blur: 10, offset: 2, angle: 90 });
function card(s, x, y, w, h, o = {}) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: o.r ?? 0.12,
    fill: { color: o.fill ?? K.surface }, line: { color: o.line ?? K.line, width: o.lineW ?? 0.75, dashType: o.dash },
    shadow: o.shadow === false ? undefined : shadow(), objectName: o.name });
}
function iconCircle(s, x, y, d, icon, o = {}) {
  s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: o.fill ?? K.surface2 }, line: { color: o.line ?? K.line2, width: 0.75 } });
  const p = d * 0.24;
  s.addImage({ path: A(`icon_${icon}_${o.color ?? "bronze"}.png`), x: x + p, y: y + p, w: d - 2 * p, h: d - 2 * p, altText: icon });
}
const t = (s, text, o) => s.addText(text, { isTextBox: true, margin: 0, valign: "top", fontSize: 12, color: K.ink2, ...o });
const label = (s, text, x, y, w, dark) => t(s, text, { x, y, w, h: 0.24, fontSize: 10, bold: true, charSpacing: 2, color: dark ? K.dTag : K.ink3, valign: "middle" });
function arrow(s, x1, y1, x2, y2, o = {}) {
  s.addShape(pres.shapes.LINE, { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), flipH: x2 < x1, flipV: y2 < y1,
    line: { color: o.color ?? K.ink3, width: o.width ?? 1.25, dashType: o.dash, endArrowType: o.head === false ? undefined : "triangle" } });
}
function chip(s, x, y, w, text, o = {}) {
  const h = o.h ?? 0.32;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: h / 2, fill: { color: o.fill ?? K.surface }, line: { color: o.line ?? K.line2, width: 0.75 } });
  t(s, text, { x: x + 0.08, y, w: w - 0.16, h, fontSize: o.fs ?? 11, color: o.color ?? K.ink2, valign: "middle", align: "center", bold: o.bold });
}
const cell = (text, o = {}) => ({ text, options: o });

// =====================================================================================================
// Title slide (dark, no artwork)
// =====================================================================================================
pres.addSection({ title: "Title" });
{
  const s = pres.addSlide({ masterName: "TEKME_DARK_TITLE", sectionTitle: "Title" });
  s.addImage({ path: A("mark_dark.png"), x: 0.75, y: 0.72, w: 0.46, h: 0.46, altText: "TEKMĒ Evidence Mark" });
  t(s, "TINYVERSE  ·  PROBLEM STATEMENT 01", { x: 1.38, y: 0.72, w: 5, h: 0.46, fontSize: 11, bold: true, charSpacing: 3, color: K.dTag, valign: "middle" });

  s.addImage({ path: A("wm_tekme_dark.png"), x: 0.75, y: 1.62, w: 5.3, h: 5.3 / WM_RATIO, altText: "TEKMĒ" });
  s.addImage({ path: A("wm_tag_dark.png"), x: 0.79, y: 3.08, w: 4.4, h: 4.4 / TAG_RATIO, altText: "Evidence over instinct." });
  t(s, "On-Device Scam Message Detector", { x: 0.75, y: 3.78, w: 7, h: 0.5, fontSize: 24, color: K.dInk, fontFace: HEAD, valign: "middle" });
  t(s, "An offline, explainable system that classifies a single SMS or WhatsApp message as SCAM or SAFE, names the scam type, "
    + "reports a calibrated confidence and shows its evidence — without the message ever leaving the device.",
    { x: 0.75, y: 4.38, w: 6.9, h: 0.85, fontSize: 13.5, color: K.dInk2, lineSpacingMultiple: 1.1 });

  // At a glance — verified figures only.
  card(s, 8.35, 0.72, 4.23, 4.5, { fill: K.dCard, line: K.dLine, shadow: false, name: "At a glance" });
  label(s, "AT A GLANCE", 8.65, 0.95, 3.6, true);
  const glance = [[F.acc, `accuracy on ${F.n} unseen test messages`], ["0", "network calls to analyse a message"],
    ["5", "scam categories, plus an UNCERTAIN state"], ["3", "languages: English, Hinglish, Hindi"]];
  glance.forEach(([big, small], i) => {
    const y = 1.35 + i * 0.94;
    if (i) s.addShape(pres.shapes.LINE, { x: 8.65, y: y - 0.1, w: 3.63, h: 0, line: { color: K.dLine, width: 0.75 } });
    t(s, big, { x: 8.65, y, w: 3.6, h: 0.46, fontSize: 26, color: K.dInk, fontFace: HEAD, valign: "middle" });
    t(s, small, { x: 8.65, y: y + 0.47, w: 3.6, h: 0.26, fontSize: 11, color: K.dInk2 });
  });

  // Member / USN / branch / problem statement strip.
  card(s, 0.75, 5.62, 11.83, 1.16, { fill: K.dCard, line: K.dLine, shadow: false, name: "Presenter details" });
  const info = [["MEMBER", "Divya Ramji", 2.05], ["USN", "1MS24CI044", 1.85], ["BRANCH", "Computer Science and Engineering (AI & ML)", 3.95],
    ["PROBLEM STATEMENT", "PS-01 · On-Device Scam Message Detector", 3.98]];
  let x = 1.05;
  info.forEach(([k, v, w], i) => {
    if (i) s.addShape(pres.shapes.LINE, { x: x - 0.2, y: 5.85, w: 0, h: 0.7, line: { color: K.dLine, width: 0.75 } });
    t(s, k, { x, y: 5.83, w: w - 0.3, h: 0.24, fontSize: 9, bold: true, charSpacing: 2, color: K.dBronze, valign: "middle" });
    t(s, v, { x, y: 6.1, w: w - 0.3, h: 0.5, fontSize: 13.5, color: K.dInk, valign: "middle" });
    x += w;
  });
  s.addNotes(`TEKMĒ — from the Greek tekmēr, "a sure sign or proof": judge a message by its evidence, not by instinct.
Problem Statement 01: an on-device scam message detector. One message in; SCAM or SAFE, the scam category, a calibrated confidence and the evidence out — fully offline.
At-a-glance numbers come from reports/metrics.json.`);
}

// =====================================================================================================
// Slide 1 — Problem statement and existing solutions
// =====================================================================================================
pres.addSection({ title: "Problem & Solution" });
{
  const s = pres.addSlide({ masterName: "TEKME_LIGHT", sectionTitle: "Problem & Solution" });
  s.addText("SLIDE 1  ·  PROBLEM STATEMENT & EXISTING SOLUTIONS", { placeholder: "eyebrow" });
  s.addText("Scam messages weaponise trust, urgency and language", { placeholder: "title" });

  // What the problem is.
  label(s, "WHAT THE PROBLEM IS", 0.6, 2.05, 5.8);
  t(s, "Fraudsters send SMS and WhatsApp messages that impersonate banks, couriers, employers and lenders, pushing people to tap a link, share an OTP or pay within minutes.",
    { x: 0.6, y: 2.32, w: 5.8, h: 0.62, fontSize: 12.5, color: K.ink2 });
  card(s, 0.6, 3.02, 5.8, 0.98, { name: "Example SMS" });
  t(s, [
    { text: "Dear " }, { text: "SBI", options: { bold: true, color: K.scam } }, { text: " customer, your " },
    { text: "KYC has expired and your account will be blocked within 24 hours", options: { bold: true, color: K.scam } },
    { text: ". Update immediately: " }, { text: "http://sbi-kyc-verify.example/login", options: { bold: true, color: K.scam } },
  ], { x: 0.8, y: 3.08, w: 5.4, h: 0.86, fontSize: 12.5, color: K.espresso, valign: "middle" });
  [["Impersonation", 0.6, 1.42], ["Threat", 2.1, 0.9], ["Urgency", 3.08, 1.0], ["Look-alike link", 4.16, 1.5]]
    .forEach(([lab, cx, w]) => chip(s, cx, 4.1, w, lab, { fill: K.scamBg, line: "F0C2BA", color: K.scam, h: 0.3, fs: 10.5 }));

  // Who it affects / why it matters.
  const sub = (title, xx, items) => {
    label(s, title, xx, 4.62, 2.8);
    items.forEach(([ic, h, d], i) => {
      const y = 4.95 + i * 0.64;
      iconCircle(s, xx, y, 0.4, ic);
      t(s, h, { x: xx + 0.5, y: y - 0.02, w: 2.35, h: 0.24, fontSize: 11.5, bold: true, color: K.espresso });
      t(s, d, { x: xx + 0.5, y: y + 0.22, w: 2.35, h: 0.36, fontSize: 10, color: K.ink3 });
    });
  };
  sub("WHO IT AFFECTS", 0.6, [["users", "UPI and OTP users", "One shared code can empty an account."],
    ["languages", "Hinglish and Hindi speakers", "Scams arrive in their own language."],
    ["eye", "Elderly, first-time users", "Least able to spot look-alike links."]]);
  sub("WHY IT MATTERS", 3.6, [["coins", "Direct financial loss", "OTPs, UPI PINs and fake payment links."],
    ["alert", "Scams mutate quickly", "New numbers, spellings and languages."],
    ["clock", "Decisions under pressure", "“Within 24 hours” leaves no time."]]);

  // Existing solutions and limitations (native table).
  label(s, "EXISTING SOLUTIONS AND THEIR LIMITATIONS", 6.75, 2.05, 6);
  const H = (x) => cell(x, { bold: true, color: K.surface, fill: { color: K.espresso }, fontSize: 10.5 });
  const lim = (tag, txt) => cell([{ text: `${tag}  `, options: { bold: true, color: K.bronze } }, { text: txt }]);
  const rows = [
    [H("Existing solution"), H("How it works"), H("Limitation")],
    [cell("Carrier and DLT sender filters", { bold: true, color: K.espresso }), cell("Block unregistered or reported sender IDs on the network."), lim("Accuracy", "Judges the sender, not the content; new numbers get through.")],
    [cell("Built-in phone spam filters", { bold: true, color: K.espresso }), cell("Operating-system filtering of unknown senders."), lim("Usability", "A black box: rarely says why a message was flagged.")],
    [cell("Caller-ID and spam-blocker apps", { bold: true, color: K.espresso }), cell("Crowd-sourced reputation of phone numbers."), lim("Privacy", "Typically relies on cloud lookups; misses fresh numbers.")],
    [cell("Cloud AI chatbots", { bold: true, color: K.espresso }), cell("User pastes the message into an online assistant."), lim("Privacy · Cost", "Message leaves the device; per-request cost; no calibrated confidence.")],
    [cell("Awareness campaigns, reporting portals", { bold: true, color: K.espresso }), cell("Educate users; report fraud after it happens."), lim("Speed · Scale", "Help after the loss, not at the moment of decision.")],
  ];
  s.addTable(rows, { x: 6.75, y: 2.32, w: 5.98, colW: [1.62, 1.86, 2.5], fontSize: 10, color: K.ink2, valign: "middle",
    fill: { color: K.surface }, border: { type: "solid", pt: 0.75, color: K.line }, rowH: [0.34, 0.6, 0.6, 0.6, 0.6, 0.6], margin: [3, 6, 3, 6] });

  card(s, 6.75, 6.02, 5.98, 0.8, { fill: K.espresso, line: K.espresso, name: "The gap" });
  t(s, [{ text: "The gap  ", options: { bold: true, color: K.whiskey } },
    { text: "No free tool reads the message itself, on the device, in Indian languages, and explains its verdict.", options: { color: K.surface } }],
    { x: 6.98, y: 6.02, w: 5.55, h: 0.8, fontSize: 13, valign: "middle" });
  s.addNotes(`What: SMS and WhatsApp scams impersonate banks (KYC), couriers, lenders and employers, and push people to act in minutes.
Who: anyone with a phone — especially UPI/OTP users, Hinglish/Hindi speakers and elderly or first-time digital users.
Why it matters: one shared OTP or one tap on a look-alike link means direct financial loss; scammers change numbers and wording faster than block-lists.
Existing tools filter senders, look numbers up in the cloud, or require uploading the message to an AI service. Limitations span accuracy, usability, privacy, cost, speed and scale. None reads the message on the device and explains its verdict.`);
}

// =====================================================================================================
// Slide 2 — Proposed solution
// =====================================================================================================
{
  const s = pres.addSlide({ masterName: "TEKME_LIGHT", sectionTitle: "Problem & Solution" });
  s.addText("SLIDE 2  ·  PROPOSED SOLUTION", { placeholder: "eyebrow" });
  s.addText("TEKMĒ reads the message and shows its evidence", { placeholder: "title" });

  // Real screenshot of the running website in a browser frame.
  const fx0 = 0.6, fy0 = 2.08, fw = 5.75, img = fw / (2880 / 2250);
  card(s, fx0, fy0, fw, img + 0.3, { r: 0.08, fill: K.surface, line: K.line2, name: "Browser frame" });
  [0, 1, 2].forEach((i) => s.addShape(pres.shapes.OVAL, { x: fx0 + 0.15 + i * 0.17, y: fy0 + 0.1, w: 0.1, h: 0.1, fill: { color: K.line2 }, line: { color: K.line2 } }));
  t(s, "127.0.0.1:8000  ·  live app, running offline", { x: fx0 + 0.75, y: fy0 + 0.04, w: 4, h: 0.22, fontSize: 9, color: K.ink3, valign: "middle" });
  s.addImage({ path: A("shot_home_light.jpg"), x: fx0 + 0.02, y: fy0 + 0.28, w: fw - 0.04, h: img - 0.02, altText: "Screenshot of the TEKMĒ home page with a live analysis" });

  const X = 6.75, RW = 5.98;
  label(s, "WHAT WE ARE BUILDING", X, 2.05, RW);
  t(s, "A privacy-first web app, installable and offline, that analyses one message on the device and returns a verdict, scam category, calibrated confidence, the evidence and what to do next.",
    { x: X, y: 2.32, w: RW, h: 0.62, fontSize: 12, color: K.ink2 });

  // Workflow from the user's point of view.
  label(s, "USER WORKFLOW", X, 3.05, RW);
  const steps = [["1", "Paste", "SMS, WhatsApp, link, UPI ID or CSV"], ["2", "Analyse", "on this device, in milliseconds"],
    ["3", "Review", "verdict, confidence, evidence"], ["4", "Act", "tailored safety advice"]];
  const sw = (RW - 3 * 0.18) / 4;
  steps.forEach(([n, h, d], i) => {
    const x = X + i * (sw + 0.18);
    card(s, x, 3.33, sw, 0.82, { fill: i === 1 ? K.tint : K.surface, line: i === 1 ? K.bronze : K.line2, shadow: false, r: 0.08, name: h });
    t(s, `${n}  ${h}`, { x: x + 0.1, y: 3.38, w: sw - 0.2, h: 0.28, fontSize: 12, bold: true, color: K.espresso });
    t(s, d, { x: x + 0.1, y: 3.66, w: sw - 0.2, h: 0.45, fontSize: 9.5, color: K.ink3 });
    if (i < 3) arrow(s, x + sw + 0.02, 3.74, x + sw + 0.16, 3.74, { color: K.bronze });
  });

  // Key features in three groups.
  label(s, "KEY FEATURES (ALL IMPLEMENTED)", X, 4.3, RW);
  const groups = [["Detect", ["Calibrated verdict", "5 scam categories", "Link, UPI, brand checks"]],
    ["Explain", ["Evidence heatmap", "Scam DNA tactics", "English + Hinglish"]],
    ["Protect and scale", ["Conversation analysis", "Batch scan, redaction", "Privacy audit, PWA"]]];
  const gw = (RW - 2 * 0.15) / 3;
  groups.forEach(([h, items], i) => {
    const x = X + i * (gw + 0.15);
    card(s, x, 4.58, gw, 1.25, { name: h });
    t(s, h, { x: x + 0.14, y: 4.65, w: gw - 0.28, h: 0.28, fontSize: 12.5, color: K.bronze, fontFace: HEAD, bold: true });
    t(s, items.map((it, j) => ({ text: it, options: { bullet: { indent: 10 }, breakLine: j < items.length - 1 } })),
      { x: x + 0.12, y: 4.95, w: gw - 0.2, h: 0.85, fontSize: 10, color: K.ink2, paraSpaceAfter: 2 });
  });

  // Why it is better than existing solutions.
  label(s, "WHY IT IS BETTER", X, 5.98, RW);
  const diffs = [["lock", "On-device", "never uploaded"], ["search", "Explains", "evidence per verdict"],
    ["gauge", "Honest", "calibrated, UNCERTAIN"], ["languages", "Robust", `Hinglish, ${F.advTypes} disguises`]];
  const dw = (RW - 3 * 0.12) / 4;
  diffs.forEach(([ic, h, d], i) => {
    const x = X + i * (dw + 0.12);
    card(s, x, 6.25, dw, 0.62, { fill: K.surface2, line: K.line, shadow: false, name: h });
    s.addImage({ path: A(`icon_${ic}_bronze.png`), x: x + 0.1, y: 6.33, w: 0.22, h: 0.22 });
    t(s, h, { x: x + 0.38, y: 6.31, w: dw - 0.42, h: 0.25, fontSize: 11.5, bold: true, color: K.espresso, valign: "middle" });
    t(s, d, { x: x + 0.1, y: 6.57, w: dw - 0.14, h: 0.24, fontSize: 9.5, color: K.ink3, valign: "middle" });
  });
  s.addNotes(`What we are building: a website that runs a trained scam detector entirely in the browser; installable as an offline app.
Workflow: paste → analysed on-device in milliseconds → verdict, category, calibrated confidence and highlighted evidence → advice.
The screenshot is the real running app: the demo KYC message is flagged Suspected Scam, Bank/KYC fraud, with its evidence dossier.
Better than existing tools: on-device (privacy), explains every verdict, honest calibrated confidence with an UNCERTAIN state, and robust to Hinglish and ${F.advTypes} disguise types.`);
}

// =====================================================================================================
// Slide 3 — Tech stack
// =====================================================================================================
pres.addSection({ title: "How it is built" });
{
  const s = pres.addSlide({ masterName: "TEKME_LIGHT", sectionTitle: "How it is built" });
  s.addText("SLIDE 3  ·  TECH STACK", { placeholder: "eyebrow" });
  s.addText("Small, local and explainable by design", { placeholder: "title" });

  const H = (x) => cell(x, { bold: true, color: K.surface, fill: { color: K.espresso }, fontSize: 10.5 });
  const L = (x) => cell(x, { bold: true, color: K.bronze });
  const rows = [
    [H("Layer"), H("What we use"), H("Why")],
    [L("Languages"), cell("Python 3.12 · TypeScript · Swift"), cell("Python for ML; TypeScript runs the model in any browser; Swift for iOS.")],
    [L("AI / ML models"), cell("scikit-learn 1.9: TF-IDF (word + character n-grams) → logistic regression; calibrated fusion of 47 signals (isotonic); 5-class category model; rule engines"),
      cell("Fast, small, and every decision is traceable to real weights.")],
    [L("Datasets"), cell(`${F.rows} messages from ${F.sources} public sources (Scam Shield IMC '25, Mishra & Soni, UCI, Indian SMS); ${F.advN} disguised test messages; external Test B (${F.tbN})`),
      cell("Open licences; leakage-audited splits; honest external test.")],
    [L("APIs"), cell("None: no LLM, no cloud service, no telemetry"), cell("Nothing about a message ever leaves the device.")],
    [L("Frontend"), cell("React 19, TypeScript, Vite 8, Tailwind CSS 4, lucide icons; model ported to TypeScript"), cell("Static app; inference runs client-side.")],
    [L("Backend"), cell("FastAPI + Uvicorn, bound to 127.0.0.1; serves the app and model files"), cell("Local only; never logs message text.")],
    [L("Database"), cell("None by design; optional history in browser localStorage, off by default"), cell("No server-side data to leak.")],
    [L("Deployment"), cell("Local server + installable PWA (service worker, offline cache); iOS project via XcodeGen"), cell("Works without internet after first load.")],
    [L("Testing"), cell("pytest, Vitest, Testing Library, axe-core, browser–Python parity test"), cell(`Parity on ${F.parN} messages; accessibility checked.`)],
  ];
  s.addTable(rows, { x: 0.6, y: 2.08, w: 8.35, colW: [1.35, 4.45, 2.55], fontSize: 10, color: K.ink2, valign: "middle",
    fill: { color: K.surface }, border: { type: "solid", pt: 0.75, color: K.line },
    rowH: [0.32, 0.4, 0.62, 0.62, 0.4, 0.5, 0.45, 0.45, 0.5, 0.45], margin: [3, 6, 3, 6] });

  // Why a small local model.
  card(s, 9.2, 2.08, 3.53, 4.75, { fill: K.espresso, line: K.espresso, name: "Why a small local model" });
  t(s, "Why a small local model?", { x: 9.45, y: 2.25, w: 3.1, h: 0.4, fontSize: 16, color: K.champagne, fontFace: HEAD, valign: "middle" });
  const why = [[F.modelMB, "model download, cached for offline use"], [F.p50, "median per message, in the browser"],
    ["0", "network calls to analyse a message"], ["₹0", "per-message cost: no API, no server bill"], ["47", "named signals behind every verdict"]];
  why.forEach(([big, small], i) => {
    const y = 2.8 + i * 0.78;
    t(s, big, { x: 9.45, y, w: 3.1, h: 0.4, fontSize: 21, bold: true, color: K.surface, fontFace: HEAD, valign: "middle" });
    t(s, small, { x: 9.45, y: y + 0.4, w: 3.1, h: 0.28, fontSize: 10, color: K.line2 });
  });
  s.addNotes(`Classic, transparent ML instead of a large language model: every verdict traces to real weights, it runs in milliseconds and needs no internet or API key.
Trained in Python with scikit-learn, then ported to TypeScript so it runs in the browser; the parity test proves identical results on ${F.parN} messages.
No database by design. Deployment is a local server plus an installable offline web app; public HTTPS hosting is future scope.
Latency measured on the developer laptop (reports/web_performance.json); varies with power state.`);
}

// =====================================================================================================
// Slide 4 — Architecture diagram (native, editable shapes)
// =====================================================================================================
{
  const s = pres.addSlide({ masterName: "TEKME_LIGHT", sectionTitle: "How it is built" });
  s.addText("SLIDE 4  ·  ARCHITECTURE DIAGRAM", { placeholder: "eyebrow" });
  s.addText("From message to verdict, entirely inside the browser", { placeholder: "title" });

  card(s, 0.6, 2.05, 12.13, 2.72, { fill: "FBF6F0", line: K.line2, lineW: 1, dash: "dash", shadow: false, r: 0.1, name: "Device boundary" });
  s.addImage({ path: A("icon_lock_bronze.png"), x: 0.8, y: 2.15, w: 0.2, h: 0.2 });
  t(s, "ON THE USER'S DEVICE  ·  BROWSER TAB  ·  ZERO NETWORK CALLS", { x: 1.07, y: 2.13, w: 7, h: 0.24, fontSize: 9.5, bold: true, charSpacing: 2, color: K.bronze, valign: "middle" });
  // Legend: where the AI model sits.
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 9.55, y: 2.17, w: 0.22, h: 0.16, rectRadius: 0.03, fill: { color: K.tint }, line: { color: K.bronze, width: 1 } });
  t(s, "trained ML model", { x: 9.82, y: 2.13, w: 1.3, h: 0.24, fontSize: 9.5, color: K.ink2, valign: "middle" });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 11.1, y: 2.17, w: 0.22, h: 0.16, rectRadius: 0.03, fill: { color: K.surface }, line: { color: K.line2, width: 0.75 } });
  t(s, "rules / logic", { x: 11.37, y: 2.13, w: 1.2, h: 0.24, fontSize: 9.5, color: K.ink2, valign: "middle" });

  const box = (x, y, w, h, title, body, o = {}) => {
    card(s, x, y, w, h, { fill: o.fill ?? K.surface, line: o.line ?? K.line2, lineW: o.lineW ?? 0.75, shadow: false, r: 0.08, name: title });
    t(s, title, { x: x + 0.1, y: y + (o.single ? 0 : 0.07), w: w - 0.2, h: o.single ? h : 0.24, fontSize: o.ts ?? 11, bold: true,
      color: o.tc ?? K.espresso, align: "center", valign: o.single ? "middle" : "top" });
    if (body) t(s, body, { x: x + 0.1, y: y + 0.31, w: w - 0.2, h: h - 0.36, valign: o.mid ? "middle" : "top", fontSize: o.bs ?? 9.5, color: o.bc ?? K.ink3, align: "center" });
  };
  const ML = { fill: K.tint, line: K.bronze, lineW: 1.25 };
  const Y0 = 2.5, H = 2.1;
  box(0.8, Y0, 1.85, H, "1  Input", "SMS / WhatsApp text\nlink · UPI ID\nsender ID\nCSV batch", { mid: true, bs: 10.5 });
  box(2.93, Y0, 1.85, H, "2  Normaliser", "invisible characters\nlook-alike letters\n0TP → OTP, S.B.I → SBI\nHinglish spellings", { mid: true, bs: 10.5 });
  const eng = [["Semantic text model", "TF-IDF word + char → LR", true], ["Scam DNA", "urgency, threat, reward…"], ["Trust signals", "links, UPI, brands, sender"], ["Genuine protection", "real OTP / bank wording"]];
  eng.forEach(([h, b, ml], i) => {
    const y = Y0 + i * 0.545;
    card(s, 5.08, y, 2.4, 0.47, { fill: ml ? K.tint : K.surface, line: ml ? K.bronze : K.line2, lineW: ml ? 1.25 : 0.75, shadow: false, r: 0.08, name: h });
    t(s, h, { x: 5.15, y: y + 0.04, w: 2.26, h: 0.2, fontSize: 10.5, bold: true, color: K.espresso, align: "center", valign: "middle" });
    t(s, b, { x: 5.15, y: y + 0.24, w: 2.26, h: 0.19, fontSize: 9, color: K.ink3, align: "center", valign: "middle" });
  });
  box(7.78, Y0, 2.3, 1.0, "3  Calibrated fusion", "47 signals → LR\n→ isotonic calibration", ML);
  box(7.78, Y0 + 1.09, 2.3, 0.47, "Category model · 5 types", null, { single: true, ts: 10, ...ML });
  box(7.78, Y0 + 1.635, 2.3, 0.47, "Familiarity → UNCERTAIN", null, { single: true, ts: 10 });
  box(10.38, Y0, 2.15, H, "4  Result", "SCAM / SAFE / UNCERTAIN\ncategory · confidence\nevidence heatmap\nforensics · advice\n(English / Hinglish)",
    { fill: K.espresso, line: K.espresso, tc: K.champagne, bc: K.line, mid: true, bs: 10.5 });

  const mid = Y0 + H / 2;
  arrow(s, 2.65, mid, 2.93, mid);
  arrow(s, 4.78, mid, 4.93, mid, { head: false });
  arrow(s, 4.93, Y0 + 0.235, 4.93, Y0 + 1.87, { head: false });
  eng.forEach((_, i) => arrow(s, 4.93, Y0 + 0.235 + i * 0.545, 5.08, Y0 + 0.235 + i * 0.545));
  eng.forEach((_, i) => arrow(s, 7.48, Y0 + 0.235 + i * 0.545, 7.63, Y0 + 0.235 + i * 0.545, { head: false }));
  arrow(s, 7.63, Y0 + 0.235, 7.63, Y0 + 1.87, { head: false });
  arrow(s, 7.63, Y0 + 0.5, 7.78, Y0 + 0.5);
  arrow(s, 8.93, Y0 + 1.0, 8.93, Y0 + 1.09);
  arrow(s, 10.08, Y0 + 0.5, 10.38, Y0 + 0.5);
  arrow(s, 10.08, Y0 + 1.87, 10.38, Y0 + 1.87);

  card(s, 0.6, 5.02, 7.75, 1.82, { fill: K.surface, line: K.line2, shadow: false, r: 0.1, name: "Training pipeline" });
  s.addImage({ path: A("icon_flask_bronze.png"), x: 0.8, y: 5.11, w: 0.2, h: 0.2 });
  t(s, "OFFLINE TRAINING  ·  PYTHON  ·  DEVELOPER MACHINE", { x: 1.07, y: 5.09, w: 6, h: 0.24, fontSize: 9.5, bold: true, charSpacing: 2, color: K.bronze, valign: "middle" });
  const pipe = [["Public datasets", `${F.rows} messages`], ["Prepare + audit", "dedupe, leakage check"], ["Train", "scikit-learn models"],
    ["Evaluate", "test, Test B, disguises"], ["Export", "float32 weights + rules"]];
  const pw = 1.27, pg = 0.2;
  pipe.forEach(([h, b], i) => {
    const x = 0.8 + i * (pw + pg);
    box(x, 5.45, pw, 0.78, h, b, { ts: 10.5, bs: 9 });
    if (i) arrow(s, x - pg, 5.84, x, 5.84);
  });
  t(s, [{ text: "Parity check  ", options: { bold: true, color: K.safe } },
    { text: `browser and Python agree on ${F.parVerdict} / ${F.parN} verdicts`, options: { color: K.ink2 } }],
    { x: 0.8, y: 6.36, w: 7.3, h: 0.3, fontSize: 10.5, valign: "middle" });
  const ex = 0.8 + 4 * (pw + pg) + pw / 2;
  arrow(s, ex, 5.45, ex, 4.77, { color: K.bronze, width: 1.5 });
  t(s, "loaded once · SHA-256 verified", { x: ex + 0.1, y: 4.8, w: 2.2, h: 0.2, fontSize: 9, italic: true, color: K.bronze, valign: "middle" });

  box(8.6, 5.02, 4.13, 0.84, "Security", "Content-Security-Policy blocks outside connections · server bound to 127.0.0.1 · no message logging", { ts: 11, bs: 9.5 });
  box(8.6, 6.0, 4.13, 0.84, "Feedback loop", "user marks a verdict wrong → kept locally → redacted export → review queue → manual retraining", { ts: 11, bs: 9.5 });
  arrow(s, 8.6, 6.42, 8.35, 6.42, { dash: "dash", color: K.bronze });
  s.addNotes(`Top band: what runs when a user analyses a message — inside the browser tab, zero network calls.
1 Input → 2 Normaliser (undoes disguises) → four engines in parallel. The AI models (tinted boxes) are the semantic text model, the calibrated fusion model and the category model; Scam DNA, trust signals and genuine-message protection are transparent rules → 3 fusion → category + familiarity check (UNCERTAIN) → 4 result with evidence and advice.
Bottom: the offline Python pipeline exports the weights the browser loads (SHA-256 verified); the parity test proves the port is exact.
Security: CSP, localhost binding, no logging, model integrity check. Feedback loop: stays local and only feeds manual retraining after review.`);
}

// =====================================================================================================
// Slide 5 — Impact
// =====================================================================================================
pres.addSection({ title: "Impact & Results" });
{
  const s = pres.addSlide({ masterName: "TEKME_LIGHT", sectionTitle: "Impact & Results" });
  s.addText("SLIDE 5  ·  IMPACT", { placeholder: "eyebrow" });
  s.addText("Safer phones without giving up privacy", { placeholder: "title" });

  card(s, 0.6, 2.05, 12.13, 0.5, { fill: K.surface2, line: K.line, shadow: false, r: 0.08, name: "Who benefits" });
  t(s, [{ text: "WHO BENEFITS   ", options: { bold: true, color: K.bronze, charSpacing: 2, fontSize: 10 } },
    { text: "Everyday phone users  ·  elderly users and their families  ·  bank and fintech fraud teams  ·  telecom operators  ·  NGOs and cyber-crime cells" }],
    { x: 0.85, y: 2.05, w: 11.7, h: 0.5, fontSize: 12, color: K.ink2, valign: "middle" });

  const cols = [
    ["heart", "Social", "Who benefits and how it improves safety", [
      "Warns at the moment of decision, before a link is tapped or an OTP shared.",
      "Works in English, Hinglish and Hindi; explains in Hinglish.",
      "Names the tactic (urgency, threat, impersonation) so users learn it.",
      "Says UNCERTAIN instead of giving false reassurance."],
      [`${F.otpFlag} / ${F.otpN}`, "genuine OTP messages flagged in testing"]],
    ["coins", "Economic", "Time, cost and industry value", [
      "No per-message cost: no API, server or cloud bill.",
      `Runs on devices people already own; one ${F.modelMB} download.`,
      "Batch scanner lets banks, NGOs and cyber cells triage reports locally.",
      "Redacted exports share evidence without personal data."],
      [F.p50, "median analysis time per message"]],
    ["cpu", "Technical", "Performance, scalability, innovation", [
      "Exact browser port of a trained scikit-learn pipeline.",
      `Calibrated probabilities (ECE ${F.ece}) with an UNCERTAIN state.`,
      `Stress-tested on ${F.advTypes} disguise types (${F.advAcc} on ${F.advN}).`,
      "Scales with users' devices: no server load per analysis."],
      [`${F.parVerdict} / ${F.parN}`, "identical verdicts in browser and Python"]],
  ];
  const cw = (12.13 - 2 * 0.3) / 3;
  cols.forEach(([ic, h, sub, bullets, [big, small]], i) => {
    const x = 0.6 + i * (cw + 0.3), y = 2.75;
    card(s, x, y, cw, 4.08, { name: h });
    iconCircle(s, x + 0.28, y + 0.25, 0.6, ic);
    t(s, h, { x: x + 1.02, y: y + 0.24, w: cw - 1.2, h: 0.38, fontSize: 20, color: K.espresso, fontFace: HEAD, valign: "middle" });
    t(s, sub, { x: x + 1.02, y: y + 0.6, w: cw - 1.2, h: 0.24, fontSize: 10, color: K.ink3, italic: true });
    t(s, bullets.map((b, j) => ({ text: b, options: { bullet: { indent: 12 }, breakLine: j < bullets.length - 1 } })),
      { x: x + 0.28, y: y + 1.05, w: cw - 0.5, h: 1.95, fontSize: 11.5, color: K.ink2, paraSpaceAfter: 5 });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: x + 0.28, y: y + 3.08, w: cw - 0.56, h: 0.8, rectRadius: 0.08, fill: { color: K.surface2 }, line: { color: K.line } });
    t(s, big, { x: x + 0.45, y: y + 3.12, w: cw - 0.9, h: 0.42, fontSize: 21, bold: true, color: K.bronze, fontFace: HEAD, valign: "middle" });
    t(s, small, { x: x + 0.45, y: y + 3.53, w: cw - 0.9, h: 0.28, fontSize: 10, color: K.ink3 });
  });
  s.addNotes(`Social: protects people where scams happen — in their own language, at the moment they are about to act — and teaches them the tactics.
Economic: zero running cost per message, no servers or API bills; organisations can triage reported messages locally.
Technical: an exact, tested browser port of a trained ML pipeline with calibrated confidence and measured robustness; it scales with users' own devices.
We do not claim money saved or users protected: TEKMĒ has not yet been deployed to real users.`);
}

// =====================================================================================================
// Slide 6 — Extras: results, future scope, references (dark, closing)
// =====================================================================================================
{
  const s = pres.addSlide({ masterName: "TEKME_DARK", sectionTitle: "Impact & Results" });
  s.addText("SLIDE 6  ·  RESULTS, FUTURE SCOPE & REFERENCES", { placeholder: "eyebrow" });
  s.addText("Measured on unseen data, and what comes next", { placeholder: "title" });

  const tiles = [[F.acc, "Accuracy", `held-out test, n ${F.n}`], [F.f1, "F1 score", `precision ${F.prec} · recall ${F.rec}`],
    [F.auc, "ROC-AUC", "1.0 = perfect ranking"], [F.ece, "Calibration error", "confidence matches reality"]];
  const tw = (7.55 - 3 * 0.15) / 4;
  tiles.forEach(([big, h, small], i) => {
    const x = 0.6 + i * (tw + 0.15);
    card(s, x, 2.05, tw, 1.05, { fill: K.dCard, line: K.dLine, shadow: false, name: h });
    t(s, big, { x: x + 0.16, y: 2.1, w: tw - 0.26, h: 0.45, fontSize: 24, color: K.dInk, fontFace: HEAD, valign: "middle" });
    t(s, h.toUpperCase(), { x: x + 0.16, y: 2.56, w: tw - 0.26, h: 0.2, fontSize: 8.5, bold: true, charSpacing: 1.5, color: K.dTag });
    t(s, small, { x: x + 0.16, y: 2.78, w: tw - 0.26, h: 0.26, fontSize: 9.5, color: K.dInk2 });
  });

  // Chart.
  card(s, 0.6, 3.25, 4.1, 2.45, { fill: K.dCard, line: K.dLine, shadow: false, name: "Accuracy chart" });
  t(s, "Accuracy across evaluation sets", { x: 0.78, y: 3.33, w: 3.8, h: 0.28, fontSize: 12, color: K.dInk, fontFace: HEAD });
  s.addChart(pres.charts.BAR, [{ name: "Accuracy", labels: chartData.map((d) => d.label), values: chartData.map((d) => +(d.v * 100).toFixed(1)) }], {
    x: 0.66, y: 3.62, w: 3.98, h: 2.03, barDir: "bar", catAxisOrientation: "maxMin", barGapWidthPct: 50,
    chartColors: [K.dBronze], showValue: true, dataLabelPosition: "outEnd", dataLabelFormatCode: '0.0"%"', dataLabelColor: K.dInk,
    dataLabelFontSize: 9.5, dataLabelFontFace: "+mn-lt", valAxisHidden: true, valAxisMinVal: 0, valAxisMaxVal: 118,
    valGridLine: { style: "none" }, catGridLine: { style: "none" }, catAxisLabelColor: K.dInk2, catAxisLabelFontSize: 9,
    catAxisLabelFontFace: "+mn-lt", catAxisLineShow: false, showLegend: false, showTitle: false, plotArea: { fill: { color: K.dCard } },
  });

  // More measurements (native table).
  const hd = (x) => cell(x, { bold: true, color: K.dTag, fill: { color: K.dCard2 }, fontSize: 9.5 });
  const r = (a, b) => [cell(a, { color: K.dInk2 }), cell(b, { bold: true, color: K.dInk, align: "right" })];
  s.addTable([
    [hd("Measurement"), cell("Result", { bold: true, color: K.dTag, fill: { color: K.dCard2 }, fontSize: 9.5, align: "right" })],
    r("False-positive rate (test)", F.fpr), r("Genuine OTPs flagged", `${F.otpFlag} / ${F.otpN}`),
    r(`Category macro-F1 (${F.catN} scams)`, F.catF1), r(`External Test B F1 (n ${F.tbN})`, F.tbF1),
    r("Browser = Python verdicts", `${F.parVerdict} / ${F.parN}`), r("Median latency in browser", F.p50),
  ], { x: 4.85, y: 3.25, w: 3.3, colW: [2.25, 1.05], fontSize: 9.5, color: K.dInk2, valign: "middle", fill: { color: K.dCard },
    border: { type: "solid", pt: 0.75, color: K.dLine }, rowH: 0.35, margin: [2, 6, 2, 6] });

  // References.
  label(s, "REFERENCES", 0.6, 5.85, 7.5, true);
  const refs = [
    "[1] Agarwal et al., Scam Shield SMS smishing reports, IMC '25 (CC BY 4.0)",
    "[2] Mishra & Soni, SMS Phishing Dataset, Mendeley Data, 2022",
    "[3] Almeida & Gómez Hidalgo, UCI SMS Spam Collection, 2011",
    "[4] Indian Scam SMS, synthetic-audited, Hugging Face (CC BY 4.0)",
    "[5] Pedregosa et al., Scikit-learn: ML in Python, JMLR 12, 2011",
    "[6] Apple, IdentityLookup framework: SMS message filtering",
  ];
  [refs.slice(0, 3), refs.slice(3)].forEach((col, i) =>
    t(s, col.map((rf, j) => ({ text: rf, options: { breakLine: j < col.length - 1 } })),
      { x: 0.6 + i * 3.82, y: 6.12, w: 3.75, h: 0.75, fontSize: 9, color: K.dInk2, paraSpaceAfter: 2 }));

  // Future scope and roadmap.
  card(s, 8.45, 2.05, 4.28, 4.8, { fill: K.dCard, line: K.dLine, shadow: false, name: "Future scope" });
  t(s, "Future scope and roadmap", { x: 8.68, y: 2.17, w: 3.9, h: 0.4, fontSize: 16, color: K.dInk, fontFace: HEAD, valign: "middle" });
  const future = [
    ["iPhone SMS filter", "Swift + IdentityLookup source written; needs a Mac build and on-device testing.", "NOT YET VERIFIED"],
    ["iPhone web app", "Host over HTTPS so the offline app installs on iPhone.", "NEXT"],
    ["Harder cases", `Test B hard subset is ${F.hardAcc}; add real Indian genuine and Hinglish messages.`, "NEXT"],
    ["Real-world FPR", `${F.synth} of training rows are synthetic; measure on real service SMS.`, "PLANNED"],
    ["On-device transformer", "Compare a small ONNX model with the current one.", "RESEARCH"],
  ];
  future.forEach(([h, d, tag], i) => {
    const y = 2.72 + i * 0.82;
    s.addShape(pres.shapes.OVAL, { x: 8.68, y: y + 0.02, w: 0.3, h: 0.3, fill: { color: K.dCopper }, line: { color: K.dCopper } });
    t(s, String(i + 1), { x: 8.68, y: y + 0.02, w: 0.3, h: 0.3, fontSize: 10.5, bold: true, color: K.dInk, align: "center", valign: "middle" });
    t(s, h, { x: 9.1, y, w: 2.2, h: 0.3, fontSize: 12, bold: true, color: K.dInk, valign: "middle" });
    t(s, tag, { x: 11.0, y: y + 0.03, w: 1.55, h: 0.24, fontSize: 8, bold: true, color: i === 0 ? K.coral : K.dBronze, align: "right", valign: "middle", charSpacing: 1 });
    t(s, d, { x: 9.1, y: y + 0.31, w: 3.45, h: 0.46, fontSize: 10, color: K.dInk2 });
  });
  s.addNotes(`All numbers are read from reports/metrics.json, web_performance.json and parity_report.json.
Held-out test: ${F.acc} accuracy on ${F.n} unseen messages; F1 ${F.f1}; ROC-AUC ${F.auc}; calibration error ${F.ece}; false-positive rate ${F.fpr}.
External Test B (different sources): ${F.tbAcc} accuracy; hard subset ${F.hardAcc} — the honest estimate for brand-new message styles. Disguised messages: ${F.advAcc}.
Limitation: ${F.synth} of training rows are synthetic, so the real-world false-positive rate on genuine service messages is not directly measured.
Future: the iPhone SMS filter exists only as source code; it has not been built or tested on a device.`);
}

(async () => {
  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log("wrote", OUT);
})().catch((e) => { console.error(e); process.exit(1); });
