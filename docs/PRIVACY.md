# Privacy design and verification

## Guarantees the design aims for

1. **Local inference.** All models (`ml/artifacts/scamprint_bundle.joblib`, `vocab.txt`) and reference data
   (`backend/data/official_domains.json`) are files on disk, loaded once at startup.
2. **No outbound traffic.** The backend never imports an HTTP client; links in messages are analysed as text
   and never visited, resolved, or checked against WHOIS or reputation services.
3. **Enforced, not just promised.** At startup `backend/core/privacy.py` patches `socket.connect` /
   `connect_ex` so the backend process *cannot* connect to any non-loopback address; attempts are counted
   and shown in the Privacy Center (`SCAMPRINT_NETWORK_GUARD=0` disables it, for debugging only).
4. **Loopback only.** Uvicorn binds to `127.0.0.1`; CORS allows only the local dev/preview origins.
5. **No retention.** Messages are processed in memory and discarded. Logs contain endpoint, message
   *length* and latency only (`SCAMPRINT_LOG_MESSAGES=1` opts in to content logging, off by default).
   Validation errors never echo the submitted text.
6. **No third-party assets.** The UI uses system fonts and hand-drawn SVG charts; the production build is
   scanned by `npm run check:offline`. A Content-Security-Policy header restricts scripts/styles to `'self'`.
   FastAPI's CDN-based `/docs` page is disabled.

Internet access is used only during **development** (`scripts/download_data.py`, `pip`, `npm`).

## Verification procedure

| # | Check | How | Automated? |
|---|---|---|---|
| P1 | Guard blocks external, allows loopback | `tests/privacy/test_privacy.py::test_guard_blocks_external_and_allows_loopback` | yes |
| P2 | Predictions make zero outbound attempts | guard counter unchanged across `predict` / `predict_batch` | yes |
| P3 | Model loads with DNS disabled | `getaddrinfo` monkey-patched to fail, then load + predict | yes |
| P4 | No raw-message logging | canary message, `caplog` must not contain it | yes |
| P5 | Local-only configuration | host = 127.0.0.1, CORS origins local, logging off | yes |
| P6 | No network client libraries in backend | AST scan for requests/httpx/urllib3/aiohttp/http.client/LLM SDKs | yes |
| P7 | No remote assets in UI build | `npm run check:offline` + pytest scan | yes |
| P8 | **End-to-end offline run** | disable Wi-Fi / unplug Ethernet → `.\run.ps1` → open http://127.0.0.1:8000 → analyse a message → Privacy Center → "Run offline prediction test" | manual |
| P9 | Live socket observation | Privacy Center lists the backend's non-loopback sockets (psutil); expected: none | live |
| P10 | OS-level observation (optional) | `Get-NetTCPConnection -OwningProcess (Get-Process python).Id` while predicting; only 127.0.0.1 entries expected | manual |

Results of the automated checks are recorded in `docs/TESTING.md`.

## What this does and does not establish

* It shows that the backend process, as shipped, makes no outbound connection while loading or predicting,
  and that it is technically prevented from doing so at the socket layer.
* It does **not** cryptographically prove the absence of every possible side channel (e.g. a malicious OS,
  a browser extension, or someone disabling the guard). The browser side is covered by the build scan and
  the CSP, not by the socket guard.
* `localhost` / `127.0.0.1` traffic between the page and the backend is loopback communication inside the
  same computer; it is not communication with an external server.
