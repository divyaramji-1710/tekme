# iOS guide — what works, what needs a Mac, and how to try it

## Status (honest)
| Item | Status |
|---|---|
| Web app / PWA on iPhone (manual paste, same on-device engine) | Implemented; desktop-browser tested. **Not yet tested on your iPhone** (needs HTTPS hosting, below). |
| Native iOS source (`ios/`) | Written: SwiftUI host app, IdentityLookup Message Filter extension, Swift classifier, XCTests, XcodeGen spec. |
| Native build | **Not verified** — never compiled (no macOS). |
| Device installation | **Not verified.** |
| Automatic SMS filtering | **Not active.** |

## What Apple allows (IdentityLookup, from Apple's documentation)
* A **Message Filter extension** is asked about **SMS/MMS from unknown senders** (not in Contacts). It is never
  given iMessages or messages from contacts, cannot read the inbox, cannot label bubbles.
* For each message it returns an action: `allow`, `junk`, `promotion` or `transaction` (`filter` is deprecated;
  iOS 16+ adds sub-actions). The Messages app files the message accordingly.
* The user enables one filter: **Settings → Apps → Messages → Unknown & Spam → SMS Filtering** (wording varies by
  iOS version).
* An extension *may* defer to a developer server (`deferQueryRequestToNetwork`); **TEKMĒ never does** — there is
  no `ILMessageFilterExtensionNetworkURL` in its Info.plist (checked by `tests/unit/test_ios_compact.py`).
* Apple developer forums report filters not being invoked on some iOS releases; behaviour must be tested per version.

## The compact model (why not the full engine)
Extensions run under tight memory limits and the full engine would need an unverified 3,000-line Swift port.
`ml/export/ios_model.py` trains a compact word 1–2-gram TF-IDF logistic regression (6,000 features, 188 kB JSON)
with preprocessing simple enough to mirror exactly in Swift, Platt-calibrated on validation, junk threshold = lowest
with validation FPR ≤ 1% (= 0.89). Measured in Python (reports/ios_compact_report.json):

| Set | Recall (scams filtered) | False-positive rate | Precision |
|---|---|---|---|
| Test (n 3,138) | 78.9 % | 1.5 % | 97.9 % |
| Test B (n 400) | 57.3 % | 3.5 % | 94.2 % |
| Adversarial (n 11,000) | 68.5 % | 0.8 % | 98.8 % |

It deliberately misses more scams than the web app to avoid hiding genuine messages. A Python test re-scores the
fixtures from the exported JSON with plain arithmetic (the exact Swift algorithm) and matches the reference.

## 1. What can be done on Windows (done)
Swift sources, XcodeGen project spec, compact model export and validation, test fixtures, documentation.

## 2. What requires macOS + Xcode
Compiling Swift for iOS, running the simulator and XCTests, code signing, installing on a device.

## 3. Hosted macOS builds
Cloud CI with macOS runners (e.g. GitHub Actions `macos-latest`) can run `xcodegen` and `xcodebuild test` on the
simulator. That would verify compilation and the parity tests. **Not set up** — it needs your GitHub account and
pushing the repository (your decision). It cannot sign a build for *your* phone without your Apple ID.

## 4. Signing and provisioning
* **Free Apple ID (Personal Team):** Xcode can sign apps for your own device; profiles expire after **7 days**
  (re-install weekly) and there are limits on the number of apps/IDs. Apple does not document whether every
  extension type is allowed for Personal Teams — you will only know by trying. Never share your Apple ID password
  or codes with anyone (including in chat).
* **Paid Apple Developer Program:** one-year profiles, TestFlight. Not required to try, not purchased.

## 5. Building on a borrowed Mac
```bash
brew install xcodegen          # or download from github.com/yonaskolb/XcodeGen
cd ios && xcodegen             # creates TEKME.xcodeproj from project.yml
open TEKME.xcodeproj
```
In Xcode: select the **TEKME** target → Signing & Capabilities → Team = your Personal Team; change the bundle-ID
prefix (`com.example.tekme`) to something unique; do the same for **TEKMEFilter**. Run the **TEKMETests** scheme
first (simulator) — it compares Swift output with the Python fixtures. Fix any mismatch before going further.

## 6. Install and enable
Connect the iPhone, select it as the run destination, Run. On the phone: Settings → General → VPN & Device
Management → trust your developer certificate. Enable Developer Mode if asked. Then enable the filter (Settings →
Apps → Messages → Unknown & Spam → SMS Filtering → TEKMĒ).

## 7. Testing with real SMS
Ask someone **not in your contacts** to send you a test SMS (e.g. a harmless message containing "Congratulations
you won a lottery prize, pay a processing fee") and a normal one. Check whether the first lands in Junk. Messages
from contacts and iMessages will never be filtered — that is Apple's design.

## 8. Disable / uninstall
Settings → Apps → Messages → Unknown & Spam → SMS Filtering → None; then delete the TEKMĒ app. Free-team installs
also stop working when the 7-day profile expires.

## PWA on iPhone (works without a Mac)
Service workers require **HTTPS**. Options: host `frontend/dist` on any HTTPS static host (public — needs your
account and approval; nothing is deployed), or a self-signed local certificate (requires installing and trusting a
profile on the phone). Then Safari → Share → Add to Home Screen, open once online, and it runs offline.
