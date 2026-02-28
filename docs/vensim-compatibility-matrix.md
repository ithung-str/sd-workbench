# Vensim Compatibility Matrix

This matrix is now aligned to the registry-driven capability model in `backend/app/vensim/function_registry.py`.

## Status Legend
- `pysd`: handled directly by PySD runtime
- `native_fallback`: PySD is partial/variable; app tracks native fallback kernels and mixed-mode warnings
- `unsupported`: blocked unless a safe fallback exists

## Function Matrix

| Function / Family | Support Mode | PySD Support | Deterministic | Notes |
|---|---|---|---|---|
| STEP | pysd | yes | yes | Exogenous step input |
| RAMP | pysd | yes | yes | Exogenous ramp input |
| PULSE | pysd | yes | yes | Pulse input |
| PULSE TRAIN | pysd | yes | yes | Train of pulse events |
| DELAY1 / DELAY3 / DELAYN | pysd | yes | yes | Dynamic delay family |
| SMOOTH / SMOOTH3 / SMOOTHN | pysd | yes | yes | Dynamic smoothing family |
| LOOKUP / WITH LOOKUP | pysd | partial | yes | Lookup behavior depends on source encoding |
| GET TIME VALUE | native_fallback | partial | yes | Time lookup behavior can vary across runtimes |
| RANDOM NORMAL | native_fallback | partial | no | Stochastic, seeded parity required |
| RANDOM EXPONENTIAL | native_fallback | partial | no | Stochastic, seeded parity required |
| SHIFT IF TRUE | unsupported | no | yes | Unsupported semantics, flagged in diagnostics |
| ALLOCATE AVAILABLE | unsupported | no | yes | Allocation structures currently blocked |

## Readiness Policy
- `green`: no unsupported/partial advanced functions detected
- `yellow`: partial/fallback families detected; run with diagnostics + parity tolerances
- `red`: unsupported function without safe fallback; execution blocked

## API Surfaces
- Import report includes function-level details in `capabilities.details` and `capabilities.families`
- Diagnostics endpoint: `GET /api/vensim/import/{import_id}/diagnostics`
- Parity readiness endpoint: `GET /api/vensim/import/{import_id}/parity-readiness`
