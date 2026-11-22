import re

import pytest

from backend.preprocessing.normalizer import preprocess
from backend.services.mutations import MUTATION_TYPES, generate, mutate

MSG = "Update your KYC immediately or your account will be blocked. Visit http://kyc-verify.example/login"


@pytest.mark.parametrize("kind", list(MUTATION_TYPES))
def test_every_mutation_changes_text(kind):
    assert mutate(MSG, kind) != MSG


def test_deterministic():
    assert mutate(MSG, "char_substitution", seed=3) == mutate(MSG, "char_substitution", seed=3)


def test_urls_preserved_by_text_mutations():
    for kind in ("char_substitution", "spacing", "unicode_confusables", "invisible_chars", "hinglish"):
        assert "http://kyc-verify.example/login" in mutate(MSG, kind)


def test_url_variation_never_invents_domains():
    for seed in range(10):
        out = mutate(MSG, "url_variation", seed=seed)
        hosts = re.findall(r"(?i)kyc-verify(?:\[\.\]|\.)example", out)
        assert hosts, out


@pytest.mark.parametrize("kind", ["char_substitution", "spacing", "punctuation_split", "unicode_confusables",
                                  "invisible_chars", "abbreviation", "repeated_chars"])
def test_normaliser_undoes_mutation(kind):
    restored = preprocess(mutate(MSG, kind)).normalized.lower()
    for w in ("kyc", "account", "blocked"):
        assert w in restored, (kind, restored)


def test_generate_types_and_variants():
    out = generate(MSG, ["spacing", "mixed_case"], variants_per_type=2)
    assert {m.type for m in out} == {"spacing", "mixed_case"}
    assert len(out) <= 4


def test_unknown_type_rejected():
    with pytest.raises(ValueError):
        generate(MSG, ["nope"])
