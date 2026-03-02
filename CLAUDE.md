# SD Workbench

System Dynamics model builder — a browser-based workbench for creating, simulating, and analyzing stock-and-flow models. Supports native equation models and Vensim `.mdl` import with PySD-backed simulation.

## Architecture

Monorepo with three layers:

- **backend/** — Python/FastAPI REST API (uvicorn, pydantic). Handles simulation, equation validation, Vensim import/conversion, and AI-assisted features (Gemini).
- **frontend/** — React 18 + TypeScript SPA (Vite, Mantine UI, ReactFlow, Recharts, Zustand). Canvas-based model editor with scenario studio, sensitivity analysis, and dashboards.
- **e2e/** — Playwright end-to-end smoke tests.
- **docs/** — Design docs: model schema, Vensim compatibility matrix, fallback policy, scenario/sensitivity guide.

## Quick Start

```bash
make install          # creates .venv + pip installs backend deps + npm installs frontend deps
make dev              # runs backend (port 8000) + frontend (port 5173) concurrently
```

Requires Python 3 and Node.js. Copy `backend/.env.example` to `.env` at the repo root for Gemini API key configuration.

## Common Commands

| Task | Command |
|---|---|
| Install everything | `make install` |
| Backend only | `make run-backend` |
| Frontend only | `make run-frontend` |
| Both (dev) | `make dev` |
| Backend tests | `make test-backend` |
| Frontend tests | `make test-frontend` |
| Frontend build | `cd frontend && npm run build` |
| E2E tests | `cd frontend && npx playwright test` |
| Type-check | `cd frontend && npx tsc -b` |

## Testing

- **Backend**: pytest — `make test-backend` (runs `backend/tests/`). Includes unit tests, integration tests, golden model fixtures, and Vensim parity tests.
- **Frontend**: vitest — `make test-frontend` (runs `frontend/src/**/*.test.ts`). Uses jsdom environment with setup in `frontend/src/test/setup.ts`.
- **E2E**: Playwright — `cd frontend && npx playwright test` (runs `e2e/smoke.spec.ts`).

Always run `make test-backend` and `make test-frontend` after changes to verify nothing is broken.

## Project Layout

```
backend/
  app/
    api/           # FastAPI routers (routes_models, routes_vensim, routes_ai, routes_imports)
    schemas/       # Pydantic models (model, vensim, ai, imported)
    converters/    # Model format converters
    equations/     # Equation parsing and evaluation
    imports/       # Model import logic
    services/      # Business logic services
    simulation/    # Euler simulation engine
    validation/    # Model validation
    vensim/        # Vensim .mdl parsing, function registry, PySD integration
  tests/
    unit/          # Unit tests
    integration/   # Integration tests
    golden_models/ # Golden model fixtures
    vensim_book_cases/  # Vensim textbook case tests
    vensim_parity/      # PySD parity tests
frontend/
  src/
    components/    # React components (canvas, dashboard, formulas, inspector, io, palette, results, scenarios, validation, workbench)
    state/         # Zustand stores (editorStore, uiStore)
    lib/           # Utilities (api client, layout, model helpers, validation, loop detection, export)
    types/         # TypeScript type definitions (model.ts)
    styles/        # CSS styles
    test/          # Test setup
e2e/               # Playwright smoke tests
docs/              # Design documentation
```

## Key Conventions

- Backend uses FastAPI with Pydantic v2 schemas. Simulation is Euler-method only (MVP).
- Frontend state managed via Zustand stores (`editorStore.ts`, `uiStore.ts`). UI built with Mantine v7 components.
- Model schema contract shared between `backend/app/schemas/model.py` and `frontend/src/types/model.ts` — keep these in sync.
- Equation syntax: simplified AST-validated subset (`+ - * / **`, parentheses, variable refs, `min/max/abs/exp/log`).
- API endpoints prefixed: `/api/models/`, `/api/vensim/`, `/api/ai/`.
- Backend runs on port 8000, frontend on port 5173. CORS configured for `localhost:5173` and `127.0.0.1:5173`.
- Environment: `GEMINI_API_KEY` and optional `GEMINI_MODEL` set in root `.env` file (not committed).
