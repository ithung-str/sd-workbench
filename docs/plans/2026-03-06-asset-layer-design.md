# Asset Layer Design

## Problem

Pipeline results (tables, YAML, files) are ephemeral or siloed in `data_tables`. There's no unified way to:
- Publish and version pipeline outputs
- Consume assets via API (for external tools, other pipelines, or a future hosted product)
- Manage all data (imported + published) in one place

## Core Concept: Asset

An **asset** is any durable, named data artifact. It replaces and generalizes `data_tables`.

```
Asset
├── kind: table | file | value
├── source: upload | google_sheets | pipeline | api
├── name, description, tags
├── lineage: { pipeline_id, node_id, run_at }  (nullable)
├── versions: [AssetVersion]
└── slug: unique human-readable identifier (for /latest endpoint)
```

### Asset Kinds

| Kind | Content | Storage | Use case |
|------|---------|---------|----------|
| `table` | columns + rows (like today's DataTable) | `columns_json` + `rows_json` | DataFrames, CSVs, spreadsheets |
| `file` | raw text or binary blob | `content_text` or `content_blob` | YAML, JSON, Markdown, configs |
| `value` | single scalar/dict/list | `value_json` | KPIs, parameters, small results |

### Slugs

Every asset gets a unique `slug` (e.g. `quarterly-revenue`, `model-config`). Slugs are:
- Auto-generated from name on creation (lowercase, hyphens, deduped)
- Editable by user
- Used in the `/latest` API endpoint

## Database Schema

### Migration: `data_tables` → `assets`

Add new columns to `data_tables`, rename table to `assets`. Existing data migrates in-place.

```sql
-- Rename existing table
ALTER TABLE data_tables RENAME TO assets;

-- Add new columns
ALTER TABLE assets ADD COLUMN kind TEXT NOT NULL DEFAULT 'table';
ALTER TABLE assets ADD COLUMN slug TEXT;
ALTER TABLE assets ADD COLUMN content_text TEXT;        -- for file assets
ALTER TABLE assets ADD COLUMN value_json TEXT;           -- for value assets
ALTER TABLE assets ADD COLUMN pipeline_id TEXT;          -- lineage
ALTER TABLE assets ADD COLUMN node_id TEXT;              -- lineage
ALTER TABLE assets ADD COLUMN run_at TEXT;               -- lineage: when pipeline produced this
ALTER TABLE assets ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE assets ADD COLUMN version_of TEXT;           -- points to original asset id (null = is original)

CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_slug ON assets(slug) WHERE slug IS NOT NULL;
```

Backfill: set `slug` from existing `name` for all current rows.

### Why not a separate versions table?

Keep it simple: versions are just rows with `version_of` pointing to the original. The "latest" is the row with the highest `version` for a given `version_of` (or `id` if it's the original). This avoids a join table and keeps queries simple. Version history is just `SELECT * FROM assets WHERE version_of = ? OR id = ? ORDER BY version DESC`.

## API Design

### Existing endpoints (backward-compatible)

Keep `/api/data/tables/*` working as aliases. Internally they route to the asset service with `kind=table`.

### New asset endpoints

```
GET    /api/assets                        — list all assets (filter: kind, source, tag, search, pipeline_id)
GET    /api/assets/:id                    — full asset detail (metadata + content)
GET    /api/assets/:id/data               — raw content only (table rows, file text, value)
GET    /api/assets/:id/data?format=csv    — format negotiation (csv, json, yaml)
GET    /api/assets/:id/versions           — version history

GET    /api/assets/by-slug/:slug          — resolve slug → latest version detail
GET    /api/assets/by-slug/:slug/data     — raw content of latest version
GET    /api/assets/by-slug/:slug/data?format=csv

POST   /api/assets                        — create asset
PUT    /api/assets/:id                    — update (creates new version if content changed)
DELETE /api/assets/:id                    — delete asset + all versions

POST   /api/assets/:id/publish            — explicit publish from pipeline result (creates version)
```

### The `/by-slug/:slug` pattern

This is the "latest" endpoint. External consumers bookmark:
```
GET /api/assets/by-slug/quarterly-revenue/data?format=csv
```
Every time the pipeline re-runs, it publishes a new version. The slug always resolves to the latest.

### Format negotiation

`GET /api/assets/:id/data?format=X`

| Kind | Supported formats | Default |
|------|-------------------|---------|
| `table` | `json`, `csv`, `yaml` | `json` |
| `file` | `raw` (returns content_text as-is) | `raw` |
| `value` | `json`, `yaml` | `json` |

### Response shapes

```json
// GET /api/assets/:id
{
  "id": "asset_123",
  "slug": "quarterly-revenue",
  "name": "Quarterly Revenue",
  "kind": "table",
  "source": "pipeline",
  "description": "Revenue by quarter",
  "tags": ["finance", "published"],
  "version": 3,
  "versions_count": 3,
  "lineage": {
    "pipeline_id": "pipe_abc",
    "node_id": "node_xyz",
    "run_at": "2026-03-06T12:00:00Z"
  },
  "columns": [...],
  "row_count": 42,
  "created_at": "2026-03-01T...",
  "updated_at": "2026-03-06T..."
}

// GET /api/assets/:id/data (kind=table, format=json)
{
  "columns": [{"key": "q", "label": "Quarter", "type": "string"}, ...],
  "rows": [["Q1", 1200], ["Q2", 1350], ...]
}

// GET /api/assets/:id/data?format=csv
Quarter,Revenue
Q1,1200
Q2,1350
```

## Backend Implementation

### Schema: `app/schemas/asset.py`

```python
class AssetKind(str, Enum):
    table = "table"
    file = "file"
    value = "value"

class AssetLineage(BaseModel):
    pipeline_id: str
    node_id: str
    run_at: str | None = None

class AssetMeta(BaseModel):
    id: str
    slug: str | None
    name: str
    kind: AssetKind
    source: str
    description: str = ""
    tags: list[str] = []
    version: int = 1
    versions_count: int = 1
    lineage: AssetLineage | None = None
    # Table-specific
    columns: list[DataColumnSchema] | None = None
    row_count: int | None = None
    column_stats: dict[str, ColumnStats] | None = None
    # Metadata
    created_at: str
    updated_at: str

class AssetDetail(AssetMeta):
    # Table
    rows: list[list] | None = None
    # File
    content_text: str | None = None
    # Value
    value: object | None = None

class AssetCreate(BaseModel):
    name: str
    kind: AssetKind = AssetKind.table
    source: str = "upload"
    slug: str | None = None       # auto-generated if omitted
    description: str = ""
    tags: list[str] = []
    lineage: AssetLineage | None = None
    # Table
    columns: list[DataColumnSchema] | None = None
    rows: list[list] | None = None
    # File
    content_text: str | None = None
    # Value
    value: object | None = None
```

### Service: `app/services/asset_service.py`

Wraps the existing `data_service.py` logic, extended for:
- Slug generation and uniqueness
- Version creation on publish
- Kind-aware content storage
- Format export (csv, yaml, json)

### Migration path

1. Add columns to `data_tables`, rename to `assets`
2. `asset_service.py` reads/writes `assets` table
3. `routes_data.py` endpoints become thin wrappers calling asset service (backward compat)
4. New `routes_assets.py` with the full API
5. Existing publish node logic in `routes_analysis.py` calls asset service

## Frontend Changes

### Rename DataPage → AssetsPage

The current `DataPage.tsx` (604 lines) becomes `AssetsPage.tsx`. Changes:

- **Header**: "Assets" instead of "Data"
- **Filters**: Add kind filter chips (All / Tables / Files / Values), source filter (All / Upload / Pipeline / Google Sheets)
- **List items**: Show kind icon, source badge, version number, lineage link
- **Detail panel**: Kind-aware content display
  - Table: existing table preview + stats
  - File: text viewer (with syntax highlighting for YAML/JSON)
  - Value: formatted JSON/scalar display
- **Slug display**: Show slug with copy button next to asset name
- **Version history**: Expandable version list in detail panel
- **API endpoint display**: Show the `/by-slug/:slug/data` URL for easy copying

### Pipeline publish flow

When a publish node runs:
1. Backend creates/updates asset via asset service
2. Returns asset ID + slug in result logs
3. Frontend can show "View asset" link in the node result

### Navigation

Route stays at `/data` (or change to `/assets` — just a path update in `App.tsx`).

## Implementation Order

1. **Backend schema + migration** — `asset.py` schema, DB migration in `db/__init__.py`
2. **Backend service** — `asset_service.py` (wrap existing data_service logic)
3. **Backend routes** — `routes_assets.py` with full API + `/by-slug` + format export
4. **Backward compat** — `routes_data.py` delegates to asset service
5. **Publish node** — update `routes_analysis.py` to use asset service with versioning
6. **Frontend API** — update `api.ts` with asset endpoints
7. **Frontend page** — rename DataPage → AssetsPage, add kind/source filters, slug display, version history
8. **Frontend publish UX** — show slug/API URL in publish node results

## Future (not in scope now)

- **API keys / auth** — for external consumers when hosted
- **Webhooks** — notify on asset update
- **Asset dependencies** — pipeline A's output → pipeline B's input, tracked
- **Binary file assets** — images, Excel files (need blob storage)
- **Scheduled publishing** — cron-triggered pipeline runs
