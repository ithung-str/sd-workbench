# SD Model Builder Model Schema (MVP v1)

This document mirrors the backend/frontend JSON contract implemented in:
- `backend/app/schemas/model.py`
- `frontend/src/types/model.ts`

## Top-level
- `id`: string
- `name`: string
- `version`: `1`
- `metadata?`: optional descriptive metadata
- `nodes[]`: stock/aux/flow nodes
- `edges[]`: influence or flow_link edges
- `outputs[]`: variable names to return in simulation results

## Notes
- Equation syntax is a simplified AST-validated subset (`+ - * / **`, parentheses, variable refs, `min/max/abs/exp/log`).
- Simulation method is fixed to Euler in the MVP.
- JSON import/export is the only persistence mode in MVP.
