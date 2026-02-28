# Vensim Parity Tests

This suite validates Vensim `.mdl` import + PySD execution parity for curated feature cases.

Each case directory should contain:
- `model.mdl`
- `outputs.json` (variables to request)
- `expected.csv` (baseline output)
- `tolerances.json`
- `capabilities.json` (expected support classification)

Start with:
1. time settings / saveper
2. STEP / RAMP / PULSE
3. DELAY / SMOOTH
4. lookups
5. subscripts (later)
