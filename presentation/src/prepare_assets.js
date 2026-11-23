// Prepares every image the deck uses from real project files:
//   * Evidence Mark logo (geometry copied from frontend/src/brand/EvidenceMark.tsx)
//   * Athena artwork (docs/design/athena_*_original.png, user-supplied, unmodified apart from resizing)
//   * crops of real screenshots of the running app (assets/raw/*.png, captured with headless Edge)
//   * Lucide icons (the same icon family the website uses), rasterised to PNG
// Run: node src/prepare_assets.js   (from the presentation/ folder)
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const Lu = require("react-icons/lu");

const ROOT = path.resolve(__dirname, "..", "..");
const OUT = path.resolve(__dirname, "..", "assets", "build");
const RAW = path.resolve(__dirname, "..", "assets", "raw");
fs.mkdirSync(OUT, { recursive: true });

const mark = ({ mark, dot, hole }) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="512" height="512">
  <rect x="5" y="9" width="54" height="9" rx="1.5" fill="${mark}"/>
  <rect x="5" y="46" width="54" height="9" rx="1.5" fill="${mark}"/>
  <rect x="27.5" y="18" width="9" height="28" fill="${mark}"/>
  <circle cx="32" cy="32" r="8.5" fill="${mark}"/>
  <circle cx="32" cy="32" r="5.6" fill="${hole}"/>
  <circle cx="32" cy="32" r="3" fill="${dot}"/>
</svg>`;

// Icons used on the slides: [file name, lucide component, hex colour]
const ICONS = [
  ["shield", "LuShieldCheck"], ["lock", "LuLock"], ["globe", "LuGlobe"], ["phone", "LuSmartphone"],
  ["users", "LuUsers"], ["alert", "LuTriangleAlert"], ["cloud", "LuCloudUpload"], ["filter", "LuFilter"],
  ["bot", "LuBot"], ["megaphone", "LuMegaphone"], ["clipboard", "LuClipboardPaste"], ["cpu", "LuCpu"],
  ["search", "LuScanSearch"], ["gauge", "LuGauge"], ["languages", "LuLanguages"], ["sparkles", "LuSparkles"],
  ["brain", "LuBrainCircuit"], ["code", "LuCodeXml"], ["server", "LuServer"], ["database", "LuDatabase"],
  ["apple", "LuTabletSmartphone"], ["heart", "LuHeartHandshake"], ["coins", "LuIndianRupee"], ["zap", "LuZap"],
  ["target", "LuTarget"], ["rocket", "LuRocket"], ["check", "LuCircleCheck"], ["clock", "LuClock"],
  ["layers", "LuLayers"], ["flask", "LuFlaskConical"], ["eye", "LuEye"], ["msg", "LuMessageSquareText"],
];
const COLOURS = { bronze: "#85431e", ivory: "#f0e8e1", muted: "#a78a78", espresso: "#34150f" };

async function icons() {
  for (const [name, comp] of ICONS) {
    if (!Lu[comp]) throw new Error(`missing icon ${comp}`);
    for (const [cname, hex] of Object.entries(COLOURS)) {
      const svg = renderToStaticMarkup(React.createElement(Lu[comp], { size: 256, color: hex, strokeWidth: 1.6 }));
      await sharp(Buffer.from(svg)).png().toFile(path.join(OUT, `icon_${name}_${cname}.png`));
    }
  }
}

async function main() {
  await sharp(Buffer.from(mark({ mark: "#85431e", dot: "#34150f", hole: "#f7f3ee" }))).png().toFile(path.join(OUT, "mark_light.png"));
  await sharp(Buffer.from(mark({ mark: "#a78a78", dot: "#f0e8e1", hole: "#111010" }))).png().toFile(path.join(OUT, "mark_dark.png"));

  // Athena artwork: resize only.
  for (const t of ["dark", "light"]) {
    await sharp(path.join(ROOT, "docs", "design", `athena_${t}_original.png`)).jpeg({ quality: 90 }).toFile(path.join(OUT, `athena_${t}.jpg`));
  }
  // Left-edge fade so the dark artwork melts into the slide background (pptxgenjs has no gradient fills).
  const fade = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600"><defs><linearGradient id="g" x1="0" x2="1">
    <stop offset="0" stop-color="#111010" stop-opacity="1"/><stop offset="0.55" stop-color="#111010" stop-opacity="0.55"/>
    <stop offset="1" stop-color="#111010" stop-opacity="0"/></linearGradient></defs><rect width="1200" height="600" fill="url(#g)"/></svg>`;
  await sharp(Buffer.from(fade)).png().toFile(path.join(OUT, "fade_dark.png"));
  const fadeUp = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><defs><linearGradient id="g" x1="0" x2="0" y1="1" y2="0">
    <stop offset="0" stop-color="#111010" stop-opacity="1"/><stop offset="1" stop-color="#111010" stop-opacity="0"/></linearGradient></defs><rect width="600" height="400" fill="url(#g)"/></svg>`;
  await sharp(Buffer.from(fadeUp)).png().toFile(path.join(OUT, "fade_dark_up.png"));

  // Screenshot crops (2x captures at 1440 px CSS width = 2880 px).
  const crop = (src, left, top, width, height, out) =>
    sharp(path.join(RAW, src)).extract({ left, top, width, height }).jpeg({ quality: 92 }).toFile(path.join(OUT, out));
  await crop("home_light.png", 0, 0, 2880, 2250, "shot_home_light.jpg");                // hero + analyzer + result
  await crop("analyze_light.png", 617, 2448, 1420, 1440, "shot_explain_light.jpg");     // heatmap, Scam DNA, key factors
  await crop("model_light.png", 617, 1580, 1080, 1030, "shot_calibration_light.jpg");   // reliability diagram
  await crop("home_dark.png", 0, 0, 2880, 2250, "shot_home_dark.jpg");

  await icons();
  console.log("assets written to", OUT);
}
main().catch((e) => { console.error(e); process.exit(1); });
