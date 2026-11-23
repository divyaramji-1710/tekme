// On-device engine performance in Node (V8, same engine family as Chromium/Edge). Writes reports/web_performance.json.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { loadEngineFromDisk } from "./helpers";
import examples from "../src/engine/generated/examples.json";

it("measures load, single-message latency and throughput", () => {
  const t0 = performance.now();
  const engine = loadEngineFromDisk();
  const loadMs = performance.now() - t0;
  const msgs = (examples as { examples: { text: string }[] }).examples.map((e) => e.text);
  for (const m of msgs) engine.predict(m); // warm-up
  const times: number[] = [];
  for (let i = 0; i < 300; i++) { const s = performance.now(); engine.predict(msgs[i % msgs.length]); times.push(performance.now() - s); }
  times.sort((a, b) => a - b);
  const s = performance.now();
  for (let i = 0; i < 300; i++) engine.predictLight(msgs[i % msgs.length]);
  const light = (performance.now() - s) / 300;
  const heap = process.memoryUsage().heapUsed / 1e6;
  const r = { runtime: `Node ${process.version} (V8)`, model_parse_and_index_ms: +loadMs.toFixed(1), full_predict_ms: { p50: +times[150].toFixed(2), p95: +times[284].toFixed(2), max: +times[299].toFixed(2) },
    batch_predict_ms_per_message: +light.toFixed(2), heap_used_mb_after_load: +heap.toFixed(0), note: "Measured on the developer laptop; numbers vary with power state (KNOWN_ISSUES K14)." };
  writeFileSync(resolve(__dirname, "../../reports/web_performance.json"), JSON.stringify(r, null, 1));
  console.log(JSON.stringify(r));
  expect(times[284]).toBeLessThan(1000);
}, 120000);
