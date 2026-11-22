from backend.preprocessing.hinglish import detect_language
from backend.preprocessing.normalizer import preprocess


def norm(t):
    return preprocess(t).normalized


def test_problem_statement_examples():
    assert norm("Your account is blocked") == "Your account is blocked"
    assert norm("Ur acc0unt is bl0cked") == "Your account is blocked"
    assert "account block" in norm("Aapka account block ho jayega")
    assert norm("Aapka acc block hone wala hai").startswith("Aapka account block")
    assert norm("Y0ur K Y C expires t0day") == "Your KYC expires today"


def test_original_is_preserved():
    t = "Y0ur K Y C expires t0day"
    p = preprocess(t)
    assert p.original == t


def test_otp_code_is_not_deleeted():
    p = preprocess("Your OTP is 483921. Do not share it with anyone.")
    assert "483921" in p.normalized
    assert [c.text for c in p.codes] == ["483921"]
    assert "xnumx" in p.model_text


def test_alphanumeric_ids_untouched():
    p = preprocess("Order KA05MN1234 shipped, ref XX4821")
    assert "KA05MN1234" in p.normalized and "XX4821" in p.normalized


def test_urls_phones_extracted_before_normalisation():
    p = preprocess("Upd8 at http://sbi-kyc.xyz/a or bit.ly/x9, call +91 98765 43210, pay to win@ybl")
    assert [u.text for u in p.urls] == ["http://sbi-kyc.xyz/a", "bit.ly/x9"]
    assert p.phones[0].text == "+91 98765 43210"
    assert p.upi_ids[0].text == "win@ybl"
    assert "xurlx" in p.model_text and "xphonex" in p.model_text and "xupix" in p.model_text


def test_sentence_typo_is_not_a_url():
    assert preprocess("Done.In the morning").urls == []
    assert preprocess("Hello.How are you").urls == []


def test_homoglyphs_and_invisible_chars():
    t = "Vеrify yоur ассоunt​ now"  # Cyrillic е, о, а, с + zero-width space
    p = preprocess(t)
    assert p.normalized == "Verify your account now"
    assert p.obfuscation.homoglyphs >= 5 and p.obfuscation.invisible_chars == 1


def test_spaced_and_punctuated_words():
    assert norm("U p d a t e your K-Y-C") == "Update your KYC"
    assert norm("v.e.r.i.f.y now") == "verify now"


def test_repeated_characters():
    assert norm("urgentttt") == "urgent"


def test_offsets_map_back_to_original():
    t = "Y0ur K Y C is bl0cked"
    p = preprocess(t)
    i = p.normalized.index("KYC")
    s, e = p.to_original(i, i + 3)
    assert t[s:e] == "K Y C"
    j = p.normalized.index("blocked")
    s, e = p.to_original(j, j + 7)
    assert t[s:e] == "bl0cked"


def test_devanagari_untouched_and_glossed():
    t = "आपका बैंक खाता बंद हो जाएगा"
    p = preprocess(t)
    assert p.normalized == t
    assert "account" in p.model_text and "blocked" in p.model_text


def test_language_detection():
    assert detect_language("Your parcel is out for delivery") == "en"
    assert detect_language("Aapka account block ho jayega, turant update karein") == "hinglish"
    assert detect_language("आपका खाता बंद हो जाएगा") == "hi"
    assert detect_language("Text me to win") == "en"


def test_empty_and_whitespace_safe():
    assert preprocess("").normalized == ""
    assert preprocess("   ").model_text == ""
