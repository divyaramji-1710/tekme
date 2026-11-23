# Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Page shows "The on-device model files could not be loaded" | `frontend/public/model/*` missing or build is stale | `python -m ml.export.export_web; cd frontend; npm run build` |
| "failed its integrity check" | `model.bin` changed without re-exporting `model.json` | Re-run `python -m ml.export.export_web` |
| A section shows "This section failed to display" | A rendering error in one page (others keep working) | Reload; run `npx vitest run tests/ui.test.tsx` to reproduce |
| Model Intelligence says the report could not be loaded | `public/data/metrics.json` missing | `python -m ml.export.export_web` (copies reports and replaces NaN with null) |
| Analysis is slow / test_single_message_latency fails | Laptop on battery or CPU busy | Plug in, set power mode to Best performance; see KNOWN_ISSUES K14 |
| Offline reload shows nothing | Service worker not installed (first visit not completed, or plain-http non-localhost origin) | Open once online over https or 127.0.0.1; Privacy Center shows the service-worker state |
| iPhone: "Add to Home Screen" app does not work offline | Served over plain http from a LAN address | Serve over HTTPS (docs/IOS_GUIDE.md) |
| `npm run check:offline` fails | A remote URL appeared in the build (e.g. in data or copy) | Remove it, or use a reserved `.example` domain for demo text |
| Garbled non-ASCII in console | Windows code page | `$env:PYTHONIOENCODING="utf-8"` |
| Theme flashes on load | `theme-init.js` blocked or missing | Ensure `/theme-init.js` is served; the CSP allows `'self'` scripts only |
| Port 8000 in use | Another server running | Stop it, or set `TEKME_PORT` before `run.ps1` |
| Parity test fails after a rule change | Browser rules not re-exported | `python -m ml.export.parity; python -m ml.export.export_web; npx vitest run tests/parity.test.ts` |
