"""Abbreviations, Romanised-Hindi spelling variants, English glosses and a
light-weight language identifier.

The glosses let an English-heavy training corpus transfer to Hinglish /
Devanagari messages: "khata band ho jayega" additionally emits the tokens
"account blocked will", which the semantic model has seen many times.
Glosses are *appended* to the model text; the original words are kept.
"""
from __future__ import annotations

import re

# SMS abbreviations / common misspellings -> canonical English (token level).
ABBREVIATIONS = {
    "ur": "your", "u": "you", "pls": "please", "plz": "please", "plzz": "please",
    "acc": "account", "acct": "account", "accnt": "account", "acnt": "account",
    "a/c": "account", "msg": "message", "msgs": "messages", "txt": "text",
    "immd": "immediately", "immed": "immediately", "b4": "before", "2day": "today",
    "2moro": "tomorrow", "2mrw": "tomorrow", "tmrw": "tomorrow", "tmr": "tomorrow",
    "amt": "amount", "bal": "balance", "avl": "available", "govt": "government",
    "cust": "customer", "verfy": "verify", "verifiy": "verify", "recieve": "receive",
    "adhar": "aadhaar", "aadhar": "aadhaar", "adhaar": "aadhaar", "txn": "transaction",
    "trxn": "transaction", "pwd": "password", "pswd": "password", "passwd": "password",
    "wtsp": "whatsapp", "whtsapp": "whatsapp", "watsapp": "whatsapp", "whatsap": "whatsapp",
    "lnk": "link", "clk": "click", "frm": "from", "thx": "thanks", "thnx": "thanks",
    "gr8": "great", "upd8": "update", "updt": "update", "nd": "and", "wid": "with",
    "imp": "important", "urgnt": "urgent", "bcoz": "because",
    "coz": "because", "cos": "because", "bnk": "bank", "blk": "block", "blkd": "blocked",
    "susp": "suspended", "nxt": "next", "ph": "phone", "mob": "mobile",
}

# Romanised Hindi spelling variants -> one canonical spelling.
_VARIANTS = {
    "aapka": ["apka", "aapkaa", "apkaa", "aapkā", "apaka"],
    "aapke": ["apke", "aapkey", "apkey"],
    "aapki": ["apki", "aapkee", "apkee"],
    "aapko": ["apko", "aapkoo"],
    "hain": ["hein", "hai", "hy", "hae", "haii"],
    "nahi": ["nahin", "nhi", "nai", "nahee", "nahii"],
    "karein": ["karen", "kare", "karo", "kariye", "kijiye", "kijie", "karey", "kre", "kro", "krein", "kren", "kijiyega"],
    "jaldi": ["jldi", "jaldee", "jaldii"],
    "turant": ["turnt", "turent", "turat"],
    "abhi": ["abi", "abhii", "abhee"],
    "jayega": ["jaega", "jaayega", "jaiga", "jayegaa", "jaaega", "jayga"],
    "jayegi": ["jaegi", "jaayegi", "jaygi"],
    "hoga": ["hogaa", "hoyega"],
    "milega": ["milegaa", "milga", "milegi"],
    "paisa": ["paise", "pese", "paisay", "paisey", "pesa"],
    "khata": ["khaata", "khate", "khaate"],
    "inaam": ["inam", "inaam", "enaam", "inām"],
    "jeeta": ["jita", "jeete", "jeeti", "jeet", "jeetaa", "jite"],
    "naukri": ["nokri", "naukari", "nokari", "naukaree"],
    "kamao": ["kamaye", "kamaiye", "kamayein", "kamaen", "kamaaye", "kamaai", "kamai"],
    "bhejo": ["bhejein", "bhejiye", "bhejen", "bheje", "bhej"],
    "batao": ["bataiye", "bataye", "batayein", "bataen", "btao"],
    "saath": ["sath", "saat"],
    "lakh": ["lac", "lacs", "lakhs", "laakh"],
    "crore": ["karod", "karor", "crores", "karode"],
    "rupaye": ["rupaya", "rupay", "rupiye"],
    "shulk": ["shulka", "shulak"],
    "jurmana": ["jurmaana", "jurmane"],
    "bijli": ["bijlee", "bijali"],
    "sampark": ["samprk", "smpark"],
    "dhanyavaad": ["dhanyawad", "dhanyavad", "dhanyvad"],
    "badhai": ["badhaai", "badhayi"],
    "muft": ["mufat", "mufth"],
    "nivesh": ["niwesh"],
    "munafa": ["munafaa", "munaafa"],
}
VARIANT_MAP = {v: k for k, vs in _VARIANTS.items() for v in vs if v != k}

# Canonical Hinglish / Devanagari terms -> English gloss tokens.
GLOSS = {
    "aapka": "your", "aapke": "your", "aapki": "your", "aapko": "you", "khata": "account",
    "band": "blocked", "bandh": "blocked", "jayega": "will", "jayegi": "will", "hoga": "will",
    "turant": "immediately", "jaldi": "urgent quickly", "abhi": "now", "inaam": "prize",
    "jeeta": "won", "naukri": "job", "kamao": "earn", "bhejo": "send", "batao": "tell",
    "karein": "do", "nahi": "not", "mat": "not", "na": "not", "shulk": "fee",
    "rashi": "amount", "jurmana": "penalty", "bijli": "electricity", "katega": "disconnected",
    "kat": "cut", "sampark": "contact", "jaankari": "information", "suchna": "notice",
    "dhanyavaad": "thanks", "badhai": "congratulations", "mubarak": "congratulations",
    "muft": "free", "byaj": "interest", "karz": "loan", "karza": "loan", "rin": "loan",
    "nivesh": "investment", "munafa": "profit", "labh": "profit", "vetan": "salary",
    "tankhwah": "salary", "baithe": "home", "ghar": "home", "satyapit": "verify",
    "paisa": "money", "rupaye": "rupees", "lakh": "lakh", "crore": "crore",
    "milega": "get", "jeetne": "win", "chuna": "selected", "chune": "selected",
    "kisi": "anyone", "saath": "with", "dhokha": "fraud", "suraksha": "security",
    "suspend": "suspended", "block": "blocked", "puraskar": "prize", "upahar": "gift",
    # Devanagari
    "खाता": "account", "खाते": "account", "बंद": "blocked", "तुरंत": "immediately",
    "लॉटरी": "lottery", "इनाम": "prize", "जीता": "won", "जीत": "won", "केवाईसी": "kyc",
    "ओटीपी": "otp", "लिंक": "link", "क्लिक": "click", "शुल्क": "fee", "नौकरी": "job",
    "लोन": "loan", "ऋण": "loan", "बैंक": "bank", "भुगतान": "payment", "अपडेट": "update",
    "सत्यापित": "verify", "साझा": "share", "करें": "do", "न": "not", "नहीं": "not",
    "पुरस्कार": "prize", "बधाई": "congratulations", "जल्दी": "urgent", "अभी": "now",
    "पैसे": "money", "रुपये": "rupees", "लाख": "lakh", "करोड़": "crore", "बिजली": "electricity",
    "कनेक्शन": "connection", "कटेगा": "disconnected", "ब्याज": "interest", "निवेश": "investment",
    "मुनाफा": "profit", "कमाएं": "earn", "कमाई": "earn", "घर": "home", "सस्पेंड": "suspended",
    "आपका": "your", "आपके": "your", "आपकी": "your", "पार्सल": "parcel", "डिलीवरी": "delivery",
}

_HINGLISH_MARKERS = {
    "aapka", "aapke", "aapki", "aapko", "hain", "ho", "hoga", "jayega", "jayegi", "karein", "nahi",
    "abhi", "turant", "jaldi", "ke", "ki", "ka", "se", "mein", "ko", "kya", "aur", "bhi",
    "toh", "kar", "liye", "wala", "wali", "gaya", "gayi", "raha", "rahe", "rahi", "diya",
    "kiya", "hua", "hui", "sakte", "chahiye", "paisa", "bhai", "yaar", "ji", "milega", "batao",
    "bhejo", "naukri", "inaam", "jeeta", "khata", "hum", "tum", "apna", "apne", "kal",
    "aaj", "yeh", "ye", "woh", "kuch", "sab", "bahut", "accha", "theek", "kab", "kaise", "kahan",
}
_REGIONAL_MARKERS = {
    # Tamil-English
    "ungal", "unga", "ungaludaiya", "irukku", "pannunga", "illa", "vendum", "seyyavum", "ungalukku",
    # Telugu-English
    "mee", "meeru", "cheyandi", "undi", "ledu", "chesukondi", "avutundi", "meeku",
    # Bengali-English
    "apnar", "korun", "hobe", "ache", "apni", "kore", "nahole", "theke",
    # Marathi-English
    "tumcha", "tumchi", "tumche", "kara", "aahe", "aahet", "nahitar", "tumhala", "hoil",
}
_WORD_RE = re.compile(r"[a-z]+|[ऀ-ॿ]+", re.IGNORECASE)


def canonical_token(tok: str) -> str | None:
    """Return a replacement for an abbreviation / spelling variant, else None."""
    low = tok.lower()
    if low in ABBREVIATIONS and ABBREVIATIONS[low] != low:
        return ABBREVIATIONS[low]
    if low in VARIANT_MAP:
        return VARIANT_MAP[low]
    return None


def glosses(text: str) -> list[str]:
    out: list[str] = []
    for w in _WORD_RE.findall(text.lower()):
        g = GLOSS.get(w)
        if g:
            out.extend(g.split())
    return out


def detect_language(text: str) -> str:
    """Return one of: en, hinglish, hi (Devanagari), regional_mixed."""
    letters = [c for c in text if c.isalpha()]
    if not letters:
        return "en"
    deva = sum(1 for c in letters if "ऀ" <= c <= "ॿ")
    if deva / len(letters) > 0.3:
        return "hi"
    words = [w.lower() for w in re.findall(r"[a-zA-Z]+", text)]
    if not words:
        return "en"
    canon = [VARIANT_MAP.get(w, w) for w in words]
    regional = sum(1 for w in canon if w in _REGIONAL_MARKERS)
    hing = sum(1 for w in canon if w in _HINGLISH_MARKERS)
    if regional >= 2 and regional >= hing * 0.5:
        return "regional_mixed"
    if hing >= 2 and hing / len(words) >= 0.1:
        return "hinglish"
    return "en"
