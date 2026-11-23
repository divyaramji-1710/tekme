// Behavioural regression set for the on-device engine: false positives are tested as carefully as detections.
// These messages were written for testing (links use reserved .example domains; numbers are fictitious).
import { describe, expect, it } from "vitest";
import { loadEngineFromDisk } from "./helpers";

const engine = loadEngineFromDisk();
const v = (t: string) => engine.predictLight(t);

const SAFE = [
  ["genuine OTP", "483921 is your OTP for login to NetBanking. Valid for 5 minutes. Do not share this OTP with anyone."],
  ["bank debit alert", "Rs.2,500.00 debited from A/c XX1234 on 12-03-24 to VPA grocer@okaxis. Avl Bal Rs 10,234."],
  ["delivery update", "Your order #40211 has been shipped and will be delivered tomorrow. Track it in the app."],
  ["personal chat", "hey, running 10 min late, order a coffee for me pls"],
  ["appointment reminder", "Reminder: your dental appointment is on Tue 14 May at 4:30 pm. Reply C to confirm."],
];
const SCAM = [
  ["KYC with look-alike link", "Dear SBI customer, your KYC has expired and your account will be blocked within 24 hours. Update immediately: http://sbi-kyc-verify.example/login", "KYC_BANK"],
  ["lottery", "Congratulations! You have won Rs 25,00,000 in the KBC lucky draw. Pay Rs 5,000 processing fee to claim your prize. Call +91 90000 00000", "LOTTERY_PRIZE"],
  ["job lure", "Earn Rs 5000 daily from home! Part time job, just like YouTube videos. Join our Telegram group now", "JOB_INVESTMENT"],
  ["instant loan fee", "Your instant loan of Rs 2 lakh is pre-approved. Pay Rs 999 processing fee to get the amount in 10 minutes", "LOAN_CREDIT"],
  ["Hinglish KYC", "Aapka SBI khata aaj band ho jayega. Turant KYC update karein warna account block: http://kyc-update.example/sbi", null],
  ["obfuscated KYC", "Y0ur acc0unt w1ll be bl0cked t0day. V e r i f y K Y C n0w at http://kyc-help.example", null],
  ["OTP sharing trap", "Your OTP is 482913. Share this OTP with our agent to stop your account from being blocked.", null],
  ["collect request", "You have received a cashback of Rs 2,000. Enter your UPI PIN and approve the request to receive it", null],
];

describe("legitimate messages stay SAFE", () => {
  for (const [name, text] of SAFE) it(name, () => expect(v(text).verdict).toBe("SAFE"));
});
describe("scams are detected", () => {
  for (const [name, text, cat] of SCAM) it(name, () => {
    const p = v(text as string);
    expect(p.verdict).toBe("SCAM");
    if (cat) expect(p.category).toBe(cat);
  });
});
describe("calibrated confidence semantics", () => {
  it("confidence is the probability of the predicted verdict and never below 0.5", () => {
    for (const [, t] of [...SAFE, ...SCAM]) {
      const p = v(t as string);
      expect(p.confidence).toBeGreaterThanOrEqual(0.5);
      expect(p.confidence).toBeCloseTo(p.verdict === "SCAM" ? p.scam_probability : 1 - p.scam_probability, 12);
    }
  });
  it("SAFE predictions never carry a category", () => {
    for (const [, t] of SAFE) expect(v(t).category).toBeNull();
  });
});
