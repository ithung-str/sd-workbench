# SD Model Builder Model Schema (MVP v1)

This document mirrors the backend/frontend JSON contract implemented in:
- `backend/app/schemas/model.py`
- `frontend/src/types/model.ts`

## Top-level
- `id`: string
- `name`: string
- `version`: `1`
- `metadata?`: optional descriptive metadata
  - `analysis?`: optional scenario/sensitivity configuration
    - `scenarios[]`: saved scenario definitions (baseline/policy/draft/archived)
    - `dashboards[]`: saved dashboard definitions
      - `id`: string
      - `name`: string
      - `description?`: optional string
      - `cards[]`
        - `id`: string
        - `type`: `kpi | line | table`
        - `title`: string
        - `variable`: variable name key from simulation series
        - `order`: number
        - `table_rows?`: optional row count for table cards
        - `x?`: optional card x-coordinate on dashboard canvas
        - `y?`: optional card y-coordinate on dashboard canvas
        - `w?`: optional card width on dashboard canvas
        - `h?`: optional card height on dashboard canvas
    - `defaults.baseline_scenario_id?`: active baseline scenario identifier
    - `defaults.active_dashboard_id?`: active dashboard identifier
- `nodes[]`: stock/aux/flow nodes
- `edges[]`: influence or flow_link edges
- `outputs[]`: variable names to return in simulation results

## Notes
- Equation syntax is a simplified AST-validated subset (`+ - * / **`, parentheses, variable refs, `min/max/abs/exp/log`).
- Simulation method is fixed to Euler in the MVP.
- Scenario and sensitivity endpoints are additive:
  - `/api/models/scenarios/simulate-batch`
  - `/api/models/sensitivity/oat`
  - `/api/models/sensitivity/monte-carlo`
  - `/api/vensim/scenarios/simulate-batch`
  - `/api/vensim/sensitivity/oat`
  - `/api/vensim/sensitivity/monte-carlo`
- JSON import/export remains the persistence mode for model + analysis state.
