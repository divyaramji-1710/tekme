// Deterministic, local safety guidance (English + Hinglish). No language model is involved: advice is chosen
// from fixed templates by verdict tier, category and the evidence actually found in the message.
import type { Category } from "../engine/types";

export type Lang = "en" | "hinglish";
export type Tier = "scam_high" | "scam" | "uncertain" | "safe" | "safe_caution";
export interface GuidanceItem { id: string; text: string; urgent?: boolean }
export interface Guidance { tier: Tier; headline: string; steps: GuidanceItem[]; report: string }

const T = {
  en: {
    headline: {
      scam_high: "Strong evidence of a scam. Do not respond.",
      scam: "Likely a scam. Treat it as unsafe until verified.",
      uncertain: "Not enough evidence either way. Verify before you act.",
      safe: "Looks like a genuine message.",
      safe_caution: "Looks genuine, but some details deserve a second look.",
    },
    generic: [
      ["no_click", "Do not open links or download apps from this message."],
      ["no_share", "Never share OTPs, PINs, CVV, passwords or card numbers - no bank, app or courier needs them."],
      ["verify", "If you are worried, contact the organisation through its official app, website or the number printed on your card."],
    ],
    category: {
      KYC_BANK: [["kyc", "Banks do not block accounts over SMS links. Check KYC status only in your bank's official app or at a branch."]],
      LOTTERY_PRIZE: [["prize", "You cannot win a lottery or contest you did not enter. Never pay a 'fee' or 'tax' to release a prize."]],
      LOAN_CREDIT: [["loan", "Use only RBI-registered lenders. Never pay an up-front 'processing fee' to receive a loan."]],
      JOB_INVESTMENT: [["job", "Genuine employers do not charge joining fees or pay for liking videos. Guaranteed high returns are a warning sign."]],
      OTHER: [] as string[][],
    } as Record<Category, string[][]>,
    evidence: {
      otp_share: "This message asks for a code to be shared - that is how accounts are taken over.",
      pin_to_receive: "You never enter a UPI PIN to receive money. Entering it sends money.",
      collect_request: "Do not approve collect requests you did not start.",
      qr_receive: "Scanning a QR code pays money; it never receives it.",
      lookalike: "The link imitates a known brand. Type the official address yourself instead.",
      messaging_app: "Moving the conversation to WhatsApp or Telegram is a common scam step.",
      call_request: "Do not call numbers from the message; use the number on the official website.",
      secrecy: "Requests to keep things secret are a manipulation tactic. Talk to family or your bank.",
      emotional: "If a 'relative' asks for money from a new number, call them on their old number first.",
    } as Record<string, string>,
    uncertain: [
      ["pause", "Do not act on the message yet - there is no deadline a genuine organisation would enforce by SMS."],
      ["check", "Check the claim independently: log in to the official app or call the official helpline."],
    ],
    safe: [["normal", "No action is needed beyond your usual care."]],
    safe_caution: [["caution", "It looks genuine, but still avoid sharing codes and prefer the official app over links."]],
    report: "In India you can report fraud at cybercrime.gov.in or by calling 1930, and report spam SMS on the Sanchar Saathi portal (Chakshu). These are offline references - TEKMĒ never contacts them for you.",
  },
  hinglish: {
    headline: {
      scam_high: "Scam ke strong sabooth mile hain. Jawab mat dijiye.",
      scam: "Yeh shayad scam hai. Verify hone tak isse unsafe maaniye.",
      uncertain: "Saaf nateeja nahi nikla. Kuch karne se pehle verify kijiye.",
      safe: "Yeh asli message lagta hai.",
      safe_caution: "Message asli lagta hai, par kuch baatein dobara dekhiye.",
    },
    generic: [
      ["no_click", "Is message ke link mat kholiye aur koi app download mat kijiye."],
      ["no_share", "OTP, PIN, CVV, password ya card number kabhi share mat kijiye - bank, app ya courier ko inki zaroorat nahi hoti."],
      ["verify", "Shak ho to company ke official app, website ya card par likhe number se hi sampark kijiye."],
    ],
    category: {
      KYC_BANK: [["kyc", "Bank SMS link se account block nahi karte. KYC sirf bank ke official app ya branch mein check kijiye."]],
      LOTTERY_PRIZE: [["prize", "Jis lottery mein aapne hissa nahi liya, usmein aap jeet nahi sakte. Inaam ke liye koi 'fee' ya 'tax' mat bhariye."]],
      LOAN_CREDIT: [["loan", "Sirf RBI-registered lender se loan lijiye. Loan ke liye pehle 'processing fee' kabhi mat dijiye."]],
      JOB_INVESTMENT: [["job", "Asli naukri mein joining fee nahi lagti. 'Guaranteed' bada munafa khatre ka sanket hai."]],
      OTHER: [] as string[][],
    } as Record<Category, string[][]>,
    evidence: {
      otp_share: "Yeh message code share karne ko keh raha hai - isi tarah account hack hote hain.",
      pin_to_receive: "Paise lene ke liye UPI PIN kabhi nahi daalna padta. PIN daalne se paise jaate hain.",
      collect_request: "Jo collect request aapne shuru nahi ki, use approve mat kijiye.",
      qr_receive: "QR scan karne se paise jaate hain, aate nahi.",
      lookalike: "Link kisi jaane-maane brand ki nakal hai. Official address khud type kijiye.",
      messaging_app: "Baat WhatsApp ya Telegram par le jaana aam scam tareeka hai.",
      call_request: "Message mein diye number par call mat kijiye; official website wala number istemaal kijiye.",
      secrecy: "Baat chhupane ko kehna manipulation hai. Parivaar ya bank se baat kijiye.",
      emotional: "Naye number se 'rishtedar' paise maange to pehle unke purane number par call kijiye.",
    } as Record<string, string>,
    uncertain: [
      ["pause", "Abhi message par kuch mat kijiye - asli company SMS par aisi deadline nahi deti."],
      ["check", "Baat ko khud check kijiye: official app mein login kijiye ya official helpline par call kijiye."],
    ],
    safe: [["normal", "Aam saavdhani ke alawa kuch karne ki zaroorat nahi."]],
    safe_caution: [["caution", "Message asli lagta hai, phir bhi code share mat kijiye aur link ki jagah official app use kijiye."]],
    report: "Bharat mein fraud ki shikayat cybercrime.gov.in par ya 1930 par call karke kijiye; spam SMS Sanchar Saathi (Chakshu) par report kijiye. Yeh sirf jaankari hai - TEKMĒ khud inse sampark nahi karta.",
  },
};

export function guidance(args: { tier: Tier; category: Category | null; evidenceIds: string[]; lang: Lang }): Guidance {
  const t = T[args.lang];
  const steps: GuidanceItem[] = [];
  const push = (id: string, text: string, urgent = false) => { if (!steps.some((s) => s.id === id)) steps.push({ id, text, urgent }); };
  for (const id of args.evidenceIds) if (t.evidence[id]) push(id, t.evidence[id], true);
  if (args.tier === "scam_high" || args.tier === "scam") {
    if (args.category) for (const [id, text] of t.category[args.category]) push(id, text);
    for (const [id, text] of t.generic) push(id, text);
  } else if (args.tier === "uncertain") {
    for (const [id, text] of t.uncertain) push(id, text);
    for (const [id, text] of t.generic.slice(0, 2)) push(id, text);
  } else {
    for (const [id, text] of t[args.tier]) push(id, text);
  }
  return { tier: args.tier, headline: t.headline[args.tier], steps, report: t.report };
}
