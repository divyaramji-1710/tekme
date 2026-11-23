// @vitest-environment jsdom
// Renders the real app (real on-device engine loaded from public/model) for every route, checks navigation,
// theme switching and runs axe-core accessibility rules (colour contrast is checked separately in contrast.test.ts).
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { ROUTES, parseHash } from "../src/app/context";

const PUB = resolve(__dirname, "..", "public");
const networkLog: string[] = [];

beforeAll(() => {
  // Serve same-origin files from public/; anything else would be a privacy bug and is recorded.
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost/");
    networkLog.push(url.href);
    const file = resolve(PUB, "." + url.pathname);
    if (url.origin !== "http://localhost" || !existsSync(file)) return new Response("not found", { status: 404 });
    const buf = readFileSync(file);
    return new Response(buf, { status: 200 });
  });
  window.matchMedia = window.matchMedia ?? ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList);
  window.scrollTo = () => {};
  Element.prototype.scrollIntoView = () => {};
  // jsdom has no WebCrypto digest in every version; the integrity check is exercised in the browser.
  if (!globalThis.crypto?.subtle) vi.stubGlobal("crypto", { subtle: undefined });
});
afterEach(() => { cleanup(); localStorage.clear(); });

async function show(hash: string) {
  window.location.hash = hash;
  render(<App />);
  await waitFor(() => expect(document.querySelector("main, #main")).toBeTruthy(), { timeout: 20000 });
}

describe("routing", () => {
  it("parses routes and query parameters", () => {
    window.location.hash = "#/analyze?text=hello";
    expect(parseHash()).toMatchObject({ route: "analyze" });
    expect(parseHash().params.get("text")).toBe("hello");
    window.location.hash = "#/nope";
    expect(parseHash().route).toBe("");
  });
});

const HEADINGS: Record<string, RegExp> = {
  "": /Message Analyzer/, analyze: /Analyse one message/, conversation: /Follow the manipulation/, forensics: /Inspect the evidence/,
  lab: /Try to fool the model/, model: /What the model can and cannot do/, batch: /Scan many messages at once/, library: /Local scam pattern library/,
  privacy: /Audit what happens to your messages/, iphone: /honest status/, settings: /Make TEKMĒ yours/, about: /Evidence over instinct/,
};

describe("every page renders with the real engine and passes axe checks", () => {
  for (const r of ROUTES) {
    it(`#/${r}`, async () => {
      await show(`#/${r}`);
      await waitFor(() => expect(screen.getAllByText(HEADINGS[r]).length).toBeGreaterThan(0), { timeout: 30000 });
      const res = await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
      const serious = res.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
    }, 60000);
  }
});

describe("analysis flow", () => {
  it("home page analyses the demo message on-device and shows a verdict with evidence", async () => {
    await show("#/");
    await waitFor(() => expect(screen.getAllByText(/Suspected Scam|Likely Safe|Uncertain/).length).toBeGreaterThan(0), { timeout: 30000 });
    expect(screen.getByText("Evidence Dossier")).toBeTruthy();
    expect(networkLog.every((u) => u.startsWith("http://localhost/"))).toBe(true);
    expect(networkLog.some((u) => /text=|Dear/.test(u))).toBe(false); // message text never in a request
  }, 60000);
});

describe("theme switching", () => {
  it("cycles dark → light → system and persists the choice", async () => {
    localStorage.setItem("tekme:settings", JSON.stringify({ theme: "dark" }));
    await show("#/settings");
    expect(document.documentElement.dataset.theme).toBe("dark");
    const toggle = screen.getByRole("button", { name: /Dark theme/ });
    await act(async () => { fireEvent.click(toggle); });
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(JSON.parse(localStorage.getItem("tekme:settings")!).theme).toBe("light");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Light theme/ })); });
    expect(JSON.parse(localStorage.getItem("tekme:settings")!).theme).toBe("system");
  }, 60000);
  it("theme-init.js applies the saved theme before React loads", () => {
    localStorage.setItem("tekme:settings", JSON.stringify({ theme: "light", textScale: 125 }));
    document.documentElement.removeAttribute("data-theme");
    new Function(readFileSync(resolve(PUB, "theme-init.js"), "utf-8"))();
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.style.getPropertyValue("--text-scale")).toBe("1.25");
  });
});

describe("keyboard and navigation", () => {
  it("has a skip link, labelled navigation landmarks and current-page markers", async () => {
    await show("#/library");
    expect(screen.getByText("Skip to content").getAttribute("href")).toBe("#main");
    expect(screen.getByRole("navigation", { name: "Modules" })).toBeTruthy();
    const current = document.querySelectorAll('[aria-current="page"]');
    expect([...current].some((a) => a.textContent?.includes("Threat Library"))).toBe(true);
  }, 60000);
});
