# Known issues and limitations

| # | Area | Issue | Impact | Status / mitigation |
|---|---|---|---|---|
| K1 | Spec | `PS 01(1).pdf` not present in the workspace; the master prompt's Section 1 was used as the spec. | Possible unaddressed detail in the original statement. | Open — provide the PDF to reconcile. |
| K2 | Data | 41 % of rows are LLM-generated; genuine *service* messages (OTP, bank, delivery) are almost all synthetic. | Real-world FPR on genuine Indian service SMS is not directly measured. | Documented; collect real consented genuine SMS for a future test set. |
| K3 | Data | Hinglish / Hindi / regional data is small (~1.3k rows, synthetic, not native-speaker checked). | Language-specific metrics have wide uncertainty. | Glosses + augmentation; flagged in UI and reports. |
| K4 | Data | Category labels for IMC "others" and Mishra & Soni smishing come from keyword weak rules. | Training labels for those rows are noisy. | Excluded from category evaluation. |
| K5 | Data | Loan/Credit and Job/Investment scams are under-represented. | Lower category recall for these classes. | See per-class metrics; future: targeted data. |
| K6 | Model | No transformer comparison was run (Priority 3). Would need ~0.5–1 GB download (torch + model) and ~10–50× CPU latency. | Possible accuracy left on the table, especially for Hinglish. | Not attempted; requires user approval for the download. |
| K7 | Model | Decision threshold fixed at 0.5 for confidence consistency (D11). A higher threshold would lower FPR at the cost of recall. | Trade-off fixed, documented with the val sweep. | Revisit with real-traffic priors. |
| K8 | Signals | Official-domain list is small and hand-compiled; brand matching is keyword based. | Unknown legitimate domains are neutral, not "safe"; compromised official sites undetected. | Documented in the JSON `_meta`. |
| K9 | Preprocessing | Partially split words ("acc ount") and leet forms not in the vocabulary are not restored. | Some obfuscations survive normalisation (char n-grams still help). | See adversarial results per mutation type. |
| K10 | Privacy | Offline end-to-end test with Wi-Fi physically disabled must be performed manually (disabling adapters needs admin). | Automated tests cover the socket guard, DNS-disabled loading and build scan instead. | Procedure in docs/PRIVACY.md (P8). |
| K11 | UI | FastAPI `/docs` disabled because Swagger UI loads JS from a CDN. | No interactive API explorer. | `/openapi.json` still available. |
| K12 | Explanations | Correlated features can receive counter-intuitive fusion weights (e.g. "Brand / link mismatch" pushed slightly towards SAFE in the KYC example because "Look-alike domain" and "Risky link structure" carry the same information). | Key-factor list is faithful to the model but can confuse readers. | Documented; future: group correlated features or use monotonic constraints. |
| K13 | Calibration | Isotonic calibration saturates near 0/1 (many scores ≈ 0.9999); reliability bins between 0.5 and 0.8 hold few messages. | Very high confidence values cluster; mid-range calibration is estimated from few points. | UI shows ">99.5 %" instead of "100 %"; bin counts shown on hover. |
