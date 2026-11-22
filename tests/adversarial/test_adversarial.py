"""Behavioural robustness checks on hand-written probes (not a benchmark - see
reports/evaluation_report.md for measured robustness on the adversarial set)."""
import pytest

from backend.services.mutations import mutate

SCAMS = [
    "Your bank account will be blocked today. Update your KYC immediately at http://kyc-verify.example/login",
    "Congratulations! You have won Rs 25,00,000 in the lucky draw. Pay Rs 4999 processing fee to claim your prize.",
    "Part-time job: earn Rs 5000 daily by liking YouTube videos. Contact HR on WhatsApp +91 98765 43210",
]
GENUINE = [
    "483921 is your OTP for login. Valid for 5 minutes. Do not share this OTP with anyone.",
    "Your order has been shipped and will be delivered tomorrow.",
    "Hey, reached home safely. See you at lunch tomorrow!",
]


@pytest.mark.parametrize("kind", ["char_substitution", "spacing", "unicode_confusables", "invisible_chars",
                                  "mixed_case", "abbreviation", "punctuation_split", "repeated_chars"])
@pytest.mark.parametrize("text", SCAMS)
def test_obfuscated_scams_still_detected(model, kind, text):
    assert model.predict_batch([mutate(text, kind)])[0]["verdict"] == "SCAM"


@pytest.mark.parametrize("text", SCAMS)
def test_hinglish_scams_detected(model, text):
    assert model.predict_batch([mutate(text, "hinglish")])[0]["verdict"] == "SCAM"


def test_native_hinglish_and_hindi(model):
    probes = ["Aapka SBI khata aaj band ho jayega. Turant KYC update karein warna account block: http://kyc-update.example/sbi",
              "आपका बैंक खाता आज बंद हो जाएगा। तुरंत केवाईसी अपडेट करें: http://kyc-verify.example",
              "Badhai ho! Aapne 25 lakh ka inaam jeeta hai. Processing fee Rs 5000 bhejo aur inaam paao."]
    assert [p["verdict"] for p in model.predict_batch(probes)] == ["SCAM"] * 3


@pytest.mark.parametrize("kind", ["mixed_case", "repeated_chars"])
@pytest.mark.parametrize("text", GENUINE)
def test_genuine_messages_survive_noise(model, kind, text):
    assert model.predict_batch([mutate(text, kind)])[0]["verdict"] == "SAFE"


def test_otp_contrast_pair(model):
    a = model.predict("Your OTP is 483921.\nDo not share it with anyone.")
    b = model.predict("Your account will be suspended.\nSend OTP 483921 to our agent.")
    assert a["verdict"] == "SAFE" and b["verdict"] == "SCAM"
