import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Engine } from "../src/engine/engine";
import type { Manifest } from "../src/engine/textmodel";

let cached: Engine | null = null;
/** Load the exported on-device model from frontend/public/model (same files the browser fetches). */
export function loadEngineFromDisk(): Engine {
  if (cached) return cached;
  const dir = resolve(__dirname, "..", "public", "model");
  const manifest = JSON.parse(readFileSync(resolve(dir, "model.json"), "utf-8")) as Manifest;
  const b = readFileSync(resolve(dir, "model.bin"));
  const buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  cached = new Engine(manifest, buf);
  return cached;
}
