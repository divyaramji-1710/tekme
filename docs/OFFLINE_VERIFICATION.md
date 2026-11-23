# Offline verification guide

Three different claims, verified differently:

| Claim | Meaning | How to verify |
|---|---|---|
| **On-device** | Predictions run in the browser; message text is never sent anywhere. | Steps A–B |
| **Offline-capable** | After one visit the app and model load from the service-worker cache with no connection. | Step C |
| **No remote assets** | No CDN fonts, scripts, analytics or telemetry. | Step D |

TEKMĒ does **not** use local-network processing: a phone never sends messages to the laptop.

## A. Automated (no user action)
* `frontend/tests/ui.test.tsx` — renders the app with `fetch` replaced by a recorder; asserts every request is
  same-origin and no request contains message text.
* `frontend/tests/parity.test.ts` / `behaviour.test.ts` — the engine runs with no network at all (Node).
* `tests/privacy/*` (Python) — socket guard blocks non-loopback connections; model loads with DNS disabled;
  logs never contain message text.

## B. In the app
Privacy Center → **Network audit** lists every request the page made (Performance API) and flags any other
origin. **Run offline prediction test** analyses a message and confirms that zero new requests occurred.

## C. Physical offline test (needs you)
1. `.\run.ps1`, open http://127.0.0.1:8000 once (the service worker caches ~8 MB: app, fonts, artwork, model).
2. Disconnect: turn off Wi-Fi / unplug Ethernet (or Windows flight mode).
3. Stop the server (Ctrl+C in the run.ps1 window) and reload the page — it should still open from the cache
   (service workers work on `127.0.0.1`).
4. Paste messages and analyse; open Privacy Center → Run offline prediction test → expect "Passed: 0 requests".
5. Record the result in CHECKPOINTS.md (T13/T14).

On iPhone the same test works only if the app was first opened over **HTTPS** (see IOS_GUIDE.md).

## D. Build scan
`cd frontend; npm run build; npm run check:offline` fails if any built file references a remote host (only
reserved `.example/.invalid/.test` demo domains and loopback are allowed).

These are software checks, not a cryptographic proof; a compromised browser or extension could still read input.
