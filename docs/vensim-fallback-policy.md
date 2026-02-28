# Vensim Fallback and Parity Policy

## Execution Modes
- `pysd`: full PySD execution path, no fallback activations
- `mixed`: one or more fallback-designated function families detected
- `blocked`: unsupported function detected with no safe fallback path

## Deterministic vs Stochastic Parity Gates

### Deterministic families
- Require series parity against expected baseline with variable-level tolerances.
- Any structural mismatch (missing series, wrong row counts) is a hard failure.

### Stochastic families
- Require seeded reproducibility checks.
- Require statistical parity checks (quantiles, mean/stddev envelopes), not strict pointwise equality.

## Fallback Activation Rules
1. Import phase computes function-level capability details.
2. Simulation planner determines execution mode.
3. Mixed mode returns warnings and metadata `fallback_activations`.
4. Blocked mode fails fast with actionable error code/message.

## Operational Guidance
- Use diagnostics endpoint before simulation to inspect risk.
- Treat `yellow` readiness models as parity-sensitive and validate with stochastic policy tests.
- Do not bypass `blocked` mode in production until a verified fallback or native implementation is added.
