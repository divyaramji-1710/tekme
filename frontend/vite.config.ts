import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

// Generates dist/sw.js with a precache list of every built file (app shell, fonts, artwork, model).
function serviceWorker(): Plugin {
  return {
    name: "tekme-service-worker",
    apply: "build",
    closeBundle() {
      const dist = join(__dirname, "dist");
      const files: string[] = [];
      const walk = (d: string) => readdirSync(d).forEach((f) => {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else files.push("/" + relative(dist, p).split(sep).join("/"));
      });
      walk(dist);
      const list = files.filter((f) => f !== "/sw.js" && !f.endsWith(".map")).sort();
      const h = createHash("sha256");
      for (const f of list) h.update(f).update(readFileSync(join(dist, f)));
      const tpl = readFileSync(join(__dirname, "scripts", "sw-template.js"), "utf-8");
      writeFileSync(join(dist, "sw.js"), tpl.replace("__VERSION__", h.digest("hex").slice(0, 12)).replace("__FILES__", JSON.stringify(list, null, 1)));
    },
  };
}

// The UI runs the model in the browser. In development /api is proxied to the optional local Python API
// (127.0.0.1:8000); in production FastAPI may serve this build on the same origin, or it can be hosted statically.
export default defineConfig({
  plugins: [react(), tailwindcss(), serviceWorker()],
  server: {
    host: "127.0.0.1",
    proxy: { "/api": { target: "http://127.0.0.1:8000", changeOrigin: false } },
  },
  build: { outDir: "dist", sourcemap: false, chunkSizeWarningLimit: 700, assetsInlineLimit: 0 },
  test: { environment: "node", include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"] },
} as never);
