"""Download the public datasets used by TEKMĒ (development-time only).

Every file is pinned to a specific upstream revision and verified with SHA-256,
so a rerun produces byte-identical inputs. The finished application never runs
this script and never needs network access.

Usage:  python scripts/download_data.py [--force]
"""
from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "ml" / "datasets" / "raw"

HF = "https://huggingface.co/datasets"
SOURCES = [
    # (local path, url, sha256)
    ("uci_sms_spam/sms-spam-collection.csv",
     f"{HF}/codesignal/sms-spam-collection/resolve/93ffab6fa47849295146c709e341d169746582f3/sms-spam-collection.csv",
     "02036afebc8c1b3e034f9dded2dbb15974048aa5e733f564b7b9991e70fa8b97"),
    ("scam_shield_sms/train.csv",
     f"{HF}/rasheq/scam-shield-sms/resolve/08549fd9ca78fc14bd0f85fb07e7a7c8d7aca64e/train.csv",
     "6d2e348b93de06a66f641da34dbe3a847d9acbe944ac68adfc9624b7690012fd"),
    ("scam_shield_sms/val.csv",
     f"{HF}/rasheq/scam-shield-sms/resolve/08549fd9ca78fc14bd0f85fb07e7a7c8d7aca64e/val.csv",
     "0944310494c854c6d6070b054e5b7208c04d33abf24c9e17ae51d5609e2385d1"),
    ("scam_shield_sms/test.csv",
     f"{HF}/rasheq/scam-shield-sms/resolve/08549fd9ca78fc14bd0f85fb07e7a7c8d7aca64e/test.csv",
     "2d961739539ded594a476b43167b676f057b874f3deb800bbdad504ff0538c8f"),
    ("indian_scam_synthetic/synthetic_audited.csv",
     f"{HF}/Ridham115/indian-scam-sms-synthetic-audited/resolve/45e92c38ba20e973ef3ff5d1893a0a710f622018/data/synthetic_audited.csv",
     "45bde5f156a1a42698bab209e32bcd41b3639013d772f644cc3208ed39fb61e2"),
    ("scam_shield_test_b/messages.csv",
     "https://raw.githubusercontent.com/Mohamedrasheq/scam-shield/530abc07d936de69584b60407136749c19ea44b9/data/test_b/messages.csv",
     "21bac49f2bec02dfc01d691577be51165e63bd79dc2dcad073008165af8262e2"),
]


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="re-download even if present")
    args = ap.parse_args()
    ok = True
    for rel, url, digest in SOURCES:
        dest = RAW / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        if dest.exists() and not args.force and sha256(dest) == digest:
            print(f"[ok]   {rel} (cached)")
            continue
        print(f"[get]  {rel}")
        r = requests.get(url, timeout=60)
        r.raise_for_status()
        dest.write_bytes(r.content)
        actual = sha256(dest)
        if actual != digest:
            print(f"[FAIL] checksum mismatch for {rel}: {actual}")
            ok = False
        else:
            print(f"[ok]   {rel}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
