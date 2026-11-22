from backend.engines import benign_protection, tactics, trust_signals
from backend.engines.trust_signals import analyse_url, registered_domain
from backend.explainability.explainer import confidence_interpretation
from backend.preprocessing.normalizer import preprocess
from ml.datasets.prepare import weak_category


def run(t):
    p = preprocess(t)
    h = tactics.detect(p)
    s, f, _ = trust_signals.analyse(p)
    b, bf = benign_protection.analyse(p, h, f)
    return p, {x.id: x for x in h}, {x.id for x in s}, f, b


def test_message_a_tactics():
    _, h, _, _, _ = run("Your bank account will be blocked in 10 minutes. Verify immediately.")
    assert {"urgency", "threat", "authority"} <= set(h)


def test_message_b_tactics():
    _, h, _, _, _ = run("Congratulations! You won ₹5 lakh. Pay a processing fee to claim.")
    assert {"reward", "payment"} <= set(h)


def test_bank_mention_alone_is_not_impersonation():
    _, h, _, _, _ = run("Your bank account statement for October is ready in the app.")
    assert "authority" not in h


def test_negated_share_is_not_a_request():
    _, h, _, _, b = run("Your OTP is 483921. Do not share it with anyone.")
    assert "sensitive_info" not in h
    assert "otp_notification" in b.templates and b.safety_advice and not b.conflict


def test_otp_share_conflict():
    _, h, _, f, b = run("Your account will be suspended. Send OTP 483921 to our agent.")
    assert "sensitive_info" in h
    assert b.conflict
    assert any("OTP" in r for r in b.conflict_reasons)


def test_sanctioned_share_with_delivery_partner_is_benign():
    _, _, _, _, b = run("Your return pickup OTP is 5521. Share it with the delivery partner only when they collect the item.")
    assert not b.conflict


def test_transaction_alert_template():
    _, _, _, _, b = run("Rs.5,000 debited from A/c XX1234 on 12-Nov. Avl Bal Rs 12,450. -HDFC Bank")
    assert "transaction_alert" in b.templates


def test_url_features():
    assert analyse_url("bit.ly/abc")["shortener"]
    assert analyse_url("http://192.168.1.5/login")["is_ip"]
    assert analyse_url("http://sbi-kyc-update.xyz/a")["lookalike_brand"] == "sbi"
    assert analyse_url("http://sbi-kyc-update.xyz/a")["suspicious_tld"]
    assert analyse_url("https://www.amazon.in/orders")["official"]
    assert analyse_url("http://amaz0n-support.com")["lookalike_brand"] == "amazon"
    assert not analyse_url("https://www.onlinesbi.sbi")["lookalike_brand"]


def test_registered_domain():
    assert registered_domain("a.b.sbi.co.in") == "sbi.co.in"
    assert registered_domain("netbanking.hdfc.bank.in") == "hdfc.bank.in"
    assert registered_domain("x.y.example.com") == "example.com"


def test_brand_domain_mismatch():
    _, _, sig, f, _ = run("Dear SBI customer, update KYC at http://kyc-portal-update.com now")
    assert "brand_domain_mismatch" in sig and f["brand_domain_mismatch"] == 1.0


def test_no_link_is_not_treated_as_safe_signal():
    _, _, sig, f, _ = run("Send me 5000 urgently, I am in hospital")
    assert f["has_url"] == 0.0 and "official_domain" not in sig


def test_confidence_interpretation_levels():
    assert confidence_interpretation(0.95, "SCAM")["level"] == "high"
    assert confidence_interpretation(0.8, "SAFE")["level"] == "moderately high"
    assert confidence_interpretation(0.65, "SAFE")["level"] == "moderate"
    assert confidence_interpretation(0.52, "SCAM")["level"] == "low"
    assert "SCAM roughly 95%" in confidence_interpretation(0.95, "SCAM")["text"]


def test_weak_category_rules():
    assert weak_category("You have won a lottery prize") == "LOTTERY_PRIZE"
    assert weak_category("Part time job earn 5000 daily") == "JOB_INVESTMENT"
    assert weak_category("Pre-approved loan at low interest") == "LOAN_CREDIT"
    assert weak_category("Update your KYC or bank account is blocked") == "KYC_BANK"
    assert weak_category("Your parcel is held at customs") == "OTHER"
