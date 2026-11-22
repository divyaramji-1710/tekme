// Scans the production build for references to remote hosts. Exits 1 if any
// script, stylesheet, font or fetch target points outside this machine.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../dist/", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
// Allowed: loopback; XML namespaces; framework doc links in error strings; reserved, non-resolvable
// RFC 2606 / RFC 6761 domains used inside demo message TEXT; the Tailwind licence banner comment.
const allowed = [/^https?:\/\/[^/\s]+\.(example|invalid|test)(\/|$)/, /^https:\/\/tailwindcss\.com$/,/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/, /^http:\/\/www\.w3\.org\//, /^https?:\/\/react\.dev\//, /^https?:\/\/reactjs\.org\//];
const files = [];
const walk = (d) => readdirSync(d).forEach((f) => { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : files.push(p); });
walk(root);
const bad = [];
for (const f of files) {
  if (!/\.(html|js|css|svg|json)$/.test(f)) continue;
  const txt = readFileSync(f, "utf8");
  for (const m of txt.matchAll(/https?:\/\/[^\s"'`)<>]+/g)) {
    if (!allowed.some((r) => r.test(m[0]))) bad.push(`${f.slice(root.length)}: ${m[0]}`);
  }
  for (const m of txt.matchAll(/<(?:script|link)[^>]+(?:src|href)=["'](\/\/|https?:)[^"']+/g)) bad.push(`${f}: ${m[0]}`);
}
console.log(`scanned ${files.length} files`);
if (bad.length) { console.log("Remote references found:\n" + bad.join("\n")); process.exit(1); }
console.log("OK: no remote asset or API references in the production build");
