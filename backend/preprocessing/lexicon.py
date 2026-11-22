"""Vocabulary used to validate de-obfuscation candidates.

``CORE_WORDS`` is a hand-written list of words that matter for scam detection.
At training time a corpus vocabulary (words seen >= 3 times in the *training*
split) is saved to ``ml/artifacts/vocab.txt`` and merged in at runtime.
"""
from __future__ import annotations

from functools import lru_cache

from backend.core.config import ARTIFACTS

CORE_WORDS = set("""
account accounts your you yours blocked block blocking suspended suspend suspension verify verified
verification update updated updating kyc pan aadhaar bank banking otp pin cvv password passcode
login log sign click link tap visit call contact reply send share provide enter submit confirm
immediately urgent urgently now today tonight hours minutes expire expires expired expiring
deactivated deactivate closed close terminated cancel cancelled restricted frozen freeze locked
lock unlock limited penalty fine legal action police arrest court case warrant notice
congratulations congrats won win winner winning prize lottery lucky draw reward rewards gift cash
claim claimed bonus jackpot selected free offer offers lakh crore rupees money amount fee fees
processing charges tax refund payment pay paid transfer deposit loan loans credit approved
pre-approved instant emi interest limit card debit salary job jobs hiring vacancy work home
part-time earn earning income daily per day invest investment returns profit trading crypto
bitcoin stock stocks double guaranteed task tasks telegram whatsapp customer care support
service services helpline officer department government income-tax electricity bill bills
connection disconnected disconnect power tonight delivery delivered parcel package courier
order shipped shipment dispatched address customs held pending failed attempt reschedule
dear sir madam user customer valued member hello hi hey thanks thank please regards team
the and for with from that this have has will not are was were been being here there what when
where which who how why can could should would may might must also just only very more most
secure security safe safety alert alerts message messages text code number mobile phone sim
dear friend mom dad mum son daughter brother sister help emergency hospital accident trouble
secret anyone nobody tell keep confidential private personal details information info data
document documents identity id proof photo selfie apply application form register registration
activate activation renew renewal subscription netflix amazon flipkart paytm phonepe google
upi wallet balance available avl transaction transactions debited credited spent received
ending statement due overdue reminder appointment scheduled booking booked confirmed confirmation
ticket tickets flight train hotel class school college exam result results fees admission
meeting tomorrow yesterday morning evening night week month year love miss see soon later
office lunch dinner home reached reach coming going wait waiting sorry okay ok yes yeah
great good bad nice happy birthday wish wishes congratulation
""".split())


@lru_cache(maxsize=1)
def vocabulary() -> frozenset[str]:
    words = set(CORE_WORDS)
    path = ARTIFACTS / "vocab.txt"
    if path.exists():
        words.update(w.strip() for w in path.read_text(encoding="utf-8").splitlines() if w.strip())
    return frozenset(words)


def reset_cache() -> None:
    vocabulary.cache_clear()
