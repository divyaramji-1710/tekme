import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadEngineFromDisk } from "./helpers";
import { runEngines } from "../src/engine/engine";
import { analyse } from "../src/analysis/analyze";
import { punycodeDecode, urlForensics, paymentForensics, senderForensics, impersonation } from "../src/analysis/forensics";
import { redact, DEFAULT_REDACT } from "../src/analysis/redact";
import { analyseConversation, parseConversation } from "../src/analysis/conversation";
import { counterfactuals } from "../src/analysis/counterfactual";
import { parseBatch, parseCsv, summarise, toCsv, runBatch } from "../src/analysis/batch";
import { guidance } from "../src/analysis/guidance";
import { familiarity, type Intel } from "../src/analysis/intel";
import { generate, mutate } from "../src/analysis/mutations";
import { pyRound } from "../src/engine/py";
import { exportJson } from "../src/pages/Analyzer";

const engine = loadEngineFromDisk();
const intel = JSON.parse(readFileSync(resolve(__dirname, "../public/model/intel.json"), "utf-8")) as Intel;
const A = (t: string) => analyse(engine, intel, t, { lang: "en" });

describe("python-compatible helpers", () => {
  it("rounds like Python (ties to even on exact halves, exact decimal otherwise)", () => {
    expect(pyRound(0.0375, 3)).toBe(0.037); // 0.0375 is not exactly representable (below the tie)
    expect(pyRound(0.0625, 3)).toBe(0.062); // exact tie -> even
    expect(pyRound(2.5)).toBe(2);
    expect(pyRound(3.5)).toBe(4);
    expect(pyRound(-0.12345, 4)).toBe(-0.1235);
  });
});

describe("URL forensics (offline, lexical)", () => {
  it("decodes punycode", () => expect(punycodeDecode("xn--mnchen-3ya")).toBe("münchen"));
  it("flags credentials before @, IP hosts, look-alikes and downloads", () => {
    const u = urlForensics("http://www.sbi.co.in@login-verify.example/secure");
    expect(u.indicators.map((i) => i.id)).toContain("credentials");
    expect(urlForensics("http://192.168.10.5/kyc").indicators.map((i) => i.id)).toContain("ip");
    expect(urlForensics("http://sbi-kyc-update.example/login").indicators.map((i) => i.id)).toContain("lookalike");
    expect(urlForensics("https://files.example/app-update.apk").indicators.map((i) => i.id)).toContain("download");
  });
  it("never calls an official-list domain safe outright", () => {
    const u = urlForensics("https://www.indiapost.gov.in/track");
    const off = u.indicators.find((i) => i.id === "official");
    expect(off?.detail).toMatch(/not a guarantee/);
  });
});

describe("payment forensics", () => {
  it("detects PIN-to-receive, collect requests and advance fees", () => {
    const ids = (t: string) => paymentForensics(runEngines(t)).indicators.map((i) => i.id);
    expect(ids("You have received a refund. Enter your UPI PIN to receive Rs 4999 now.")).toContain("pin_to_receive");
    expect(ids("Approve the collect request of Rs 1 to verify your account")).toContain("collect_request");
    expect(ids("Pay a processing fee of Rs 499 to release your loan")).toContain("advance_fee");
  });
  it("treats a plain debit alert as a notification, not a request", () => {
    const p = paymentForensics(runEngines("Rs.2,500.00 debited from A/c XX1234 on 12-03-24. Avl Bal Rs 10,234. Not you? Call 1800-123-4567"));
    expect(p.indicators.filter((i) => i.level === "high")).toHaveLength(0);
    expect(p.notification_like).toBe(true);
  });
});

describe("brand impersonation and sender", () => {
  it("never says 'verified' and explains the link relation", () => {
    const b = impersonation(runEngines("SBI: your account is blocked. Update KYC at http://sbi-secure.example/kyc"));
    expect(b[0].brand).toBe("sbi");
    expect(b[0].link_relation).toBe("lookalike");
    expect(JSON.stringify(b)).not.toMatch(/\bverified\b(?! the sender| by)/i);
  });
  it("classifies sender formats", () => {
    expect(senderForensics("AX-SBIBNK")[0].id).toBe("header");
    expect(senderForensics("+44 7700 900123")[0].label).toMatch(/International/);
  });
});

describe("redaction and privacy-safe export", () => {
  const msg = "Call +91 98765 43210 or pay scam.help@ybl, visit http://pay-now.example/x, OTP 482913, mail a@b.com";
  it("removes identifiers", () => {
    const r = redact(msg, DEFAULT_REDACT);
    for (const s of ["98765", "scam.help@ybl", "pay-now.example", "482913", "a@b.com"]) expect(r).not.toContain(s);
    expect(r).toContain("[phone]");
  });
  it("redacted JSON export contains no raw identifiers anywhere", () => {
    const j = JSON.stringify(exportJson(A(msg), DEFAULT_REDACT));
    for (const s of ["98765", "scam.help@ybl", "pay-now.example", "482913"]) expect(j).not.toContain(s);
  });
});

describe("conversation intelligence", () => {
  it("detects escalation from rapport to credential harvesting", () => {
    const turns = parseConversation(`Bank: Hello sir, this is customer care.\nMe: ok\nBank: Your account will be blocked today. Update immediately at http://kyc.example/v\nBank: Share the OTP you received with our officer now.`);
    expect(turns.filter((t) => t.speaker === "me")).toHaveLength(1);
    const r = analyseConversation(engine, turns);
    expect(r.escalation).toBe(true);
    expect(r.risk).not.toBe("low");
  });
  it("keeps an ordinary chat low risk", () => {
    const r = analyseConversation(engine, parseConversation("Riya: are you coming for dinner tonight?\nMe: yes by 8\nRiya: great, bring the charger"));
    expect(r.risk).toBe("low");
  });
});

describe("counterfactuals", () => {
  it("re-runs the model and reports real probability changes", () => {
    const r = counterfactuals(engine, "Dear SBI customer your account will be blocked today. Update KYC immediately at http://sbi-kyc.example/login");
    expect(r.edits.length).toBeGreaterThan(0);
    const links = r.edits.find((e) => e.id === "links")!;
    expect(links.text).not.toContain("http");
    expect(links.after).toBeCloseTo(engine.predictLight(links.text, false).scam_probability, 10);
  });
});

describe("batch scanning", () => {
  it("parses quoted CSV and plain text", () => {
    expect(parseCsv('text,label\n"a, ""quoted"" b",SCAM\nc,SAFE')).toEqual([["text", "label"], ['a, "quoted" b', "SCAM"], ["c", "SAFE"]]);
    expect(parseBatch("x.txt", "one\n\ntwo\n").rows.map((r) => r.text)).toEqual(["one", "two"]);
    expect(parseBatch("x.csv", "message,label\nhi,ham\nwin,spam").rows.map((r) => r.label)).toEqual(["SAFE", "SCAM"]);
  });
  it("classifies, summarises against labels and exports CSV", async () => {
    const rows = parseBatch("s.csv", 'text,label\n"Your OTP is 482913. Do not share it.",SAFE\n"You won Rs 25 lakh lottery, pay fee to claim",SCAM').rows;
    const res = await runBatch(engine, rows, () => {});
    const s = summarise(res);
    expect(s.n).toBe(2);
    expect(s.labelled?.n).toBe(2);
    expect(toCsv(res, DEFAULT_REDACT)).not.toContain("482913");
  });
});

describe("guidance and uncertainty", () => {
  it("chooses tiers from the analysis", () => {
    expect(A("Your OTP for login is 482913. Do not share it with anyone.").uncertainty.display_verdict).toBe("SAFE");
    const g = guidance({ tier: "uncertain", category: null, evidenceIds: [], lang: "hinglish" });
    expect(g.headline).toMatch(/verify/i);
  });
  it("gives evidence-specific advice", () => {
    const a = A("Enter your UPI PIN to receive Rs 5000 cashback now, approve the collect request");
    expect(a.guidance.steps.map((s) => s.id)).toContain("pin_to_receive");
  });
  it("produces a Hinglish explanation", () => {
    expect(A("Aapka khata band ho jayega turant KYC update karein").explanation_hinglish).toMatch(/message|sabooth|tareeka/);
  });
});

const SAMPLES = resolve(__dirname, "../../ml/artifacts/parity/intel_samples.json");
describe.skipIf(!existsSync(SAMPLES))("unfamiliarity (parity with Python build)", () => {
  it("matches the similarity and coverage computed in Python", () => {
    const samples = JSON.parse(readFileSync(SAMPLES, "utf-8")) as { text: string; similarity: number; coverage: number }[];
    expect(samples.length).toBeGreaterThan(10);
    for (const s of samples) {
      const f = familiarity(engine, intel, runEngines(s.text).pre.model_text);
      expect(Math.abs(f.similarity - s.similarity)).toBeLessThan(1e-4);
      expect(Math.abs(f.coverage - s.coverage)).toBeLessThan(1e-9);
    }
  });
});

describe("mutation lab", () => {
  it("is deterministic and never rewrites links into new domains", () => {
    const t = "Update your KYC immediately at http://kyc.example/login or your account will be blocked";
    expect(mutate(t, "char_substitution", 3)).toBe(mutate(t, "char_substitution", 3));
    for (const v of generate(t)) expect(v.text.toLowerCase()).not.toMatch(/https?:\/\/(?!kyc)[a-z]/);
  });
});
