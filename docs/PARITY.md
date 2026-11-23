# Browser ⇄ Python parity

The browser engine (`frontend/src/engine/`) is a port of the Python engine. It is verified, not assumed.

## Method
1. `python -m ml.export.export_web` exports the trained bundle (float32 idf/coefficients, shared string table)
   and every rule (regexes auto-translated by `ml/export/pyregex.py`, word lists, brand list).
2. `python -m ml.export.parity` runs the Python engine on a fixed corpus and stores every intermediate output:
   normalised text, model text, language, entity spans, obfuscation counts, all 47 fusion features, semantic and
   specialist logits, fusion logit, calibrated probability, verdict, category and its probabilities, tactics with
   strengths and evidence spans, risk signals, benign templates and conflicts, explanation text, key factors,
   semantic terms and highlights (offsets converted to UTF-16).
   Corpus: full test split (3,138), 500 validation, Test B (400), 1,000 adversarial variants, 14 UI examples,
   20 hand-written edge cases (emoji, Devanagari, homoglyphs, invisible characters, styled letters, empty text).
3. `npx vitest run tests/parity.test.ts` runs the browser engine in Node (V8) and compares field by field,
   writing `reports/parity_report.json`.

This checks an implementation; it does not tune any model.

## Result (reports/parity_report.json)
| Field | Agreement (5,072 messages) |
|---|---|
| normalised text, model text, language, entities, obfuscation | 100 % |
| all fusion features | 100 % |
| tactics (+ strength + evidence spans), signals, benign templates/conflicts | 100 % |
| verdict, category | 100 % |
| explanation text, key factors, highlights | 100 % |
| semantic-term contributions (rounded to 4 dp) | 4 messages differ in the 4th decimal |

Largest absolute differences: semantic logit 2.6e-7, fusion logit 2.5e-7, scam probability 3.6e-6, category
probability 3.1e-8 — caused by float32 weights.

## Bugs the parity test caught during the port
* Rounding: Python's `round()` is exact-decimal, half-to-even; `toFixed` is not (caps ratio 3/80 = 0.0375
  rounded to 0.037 in Python, 0.038 in a naive port). Fixed with an exact-expansion `pyRound`.
* A Windows tool expanded ` ` escapes into raw characters inside a regex literal; re-escaped.

## Known residual differences
* Unicode digits from rare scripts are valued as 0 when parsing money amounts (common Indic scripts are handled).
* `str.isdigit()` superscript/circled digits are approximated by an explicit list.
These did not occur in the corpus.
