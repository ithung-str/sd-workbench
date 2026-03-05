"""Business logic for data table CRUD and column profiling."""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from statistics import mean, stdev

from app.db import connect
from app.schemas.data_table import (
    ColumnStats,
    DataColumnSchema,
    DataTableCreate,
    DataTableDetail,
    DataTableMeta,
    DataTableUpdate,
    GoogleSheetsMetaSchema,
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _row_to_meta(row) -> DataTableMeta:
    cols = json.loads(row["columns_json"])
    rows_data = json.loads(row["rows_json"])
    gs = json.loads(row["google_sheets"]) if row["google_sheets"] else None
    tags = json.loads(row["tags"]) if row["tags"] else []
    return DataTableMeta(
        id=row["id"],
        name=row["name"],
        source=row["source"],
        description=row["description"] or "",
        tags=tags,
        columns=[DataColumnSchema(**c) for c in cols],
        rowCount=len(rows_data),
        createdAt=row["created_at"],
        updatedAt=row["updated_at"],
        googleSheets=GoogleSheetsMetaSchema(**gs) if gs else None,
        original_filename=row["original_filename"],
    )


def _row_to_detail(row) -> DataTableDetail:
    cols = json.loads(row["columns_json"])
    rows_data = json.loads(row["rows_json"])
    gs = json.loads(row["google_sheets"]) if row["google_sheets"] else None
    tags = json.loads(row["tags"]) if row["tags"] else []
    columns = [DataColumnSchema(**c) for c in cols]
    stats = compute_column_stats(columns, rows_data)
    return DataTableDetail(
        id=row["id"],
        name=row["name"],
        source=row["source"],
        description=row["description"] or "",
        tags=tags,
        columns=columns,
        rowCount=len(rows_data),
        rows=rows_data,
        createdAt=row["created_at"],
        updatedAt=row["updated_at"],
        googleSheets=GoogleSheetsMetaSchema(**gs) if gs else None,
        original_filename=row["original_filename"],
        column_stats=stats,
    )


def compute_column_stats(
    columns: list[DataColumnSchema], rows: list[list]
) -> dict[str, ColumnStats]:
    stats: dict[str, ColumnStats] = {}
    for col_idx, col in enumerate(columns):
        values = [row[col_idx] for row in rows if col_idx < len(row)]
        non_null = [v for v in values if v is not None]
        null_count = len(values) - len(non_null)

        if col.type == "number":
            nums = []
            for v in non_null:
                try:
                    nums.append(float(v))
                except (ValueError, TypeError):
                    pass
            sorted_nums = sorted(nums)
            n = len(sorted_nums)

            def percentile(data: list[float], p: float) -> float | None:
                if not data:
                    return None
                k = (len(data) - 1) * p
                f = int(k)
                c = f + 1 if f + 1 < len(data) else f
                return data[f] + (k - f) * (data[c] - data[f])

            stats[col.key] = ColumnStats(
                dtype="number",
                count=n,
                nulls=null_count,
                mean=round(mean(sorted_nums), 4) if sorted_nums else None,
                std=round(stdev(sorted_nums), 4) if len(sorted_nums) >= 2 else None,
                min=sorted_nums[0] if sorted_nums else None,
                max=sorted_nums[-1] if sorted_nums else None,
                **{
                    "25%": round(percentile(sorted_nums, 0.25), 4) if sorted_nums else None,
                    "50%": round(percentile(sorted_nums, 0.50), 4) if sorted_nums else None,
                    "75%": round(percentile(sorted_nums, 0.75), 4) if sorted_nums else None,
                },
            )
        else:
            unique = len(set(str(v) for v in non_null))
            stats[col.key] = ColumnStats(
                dtype="string",
                count=len(non_null),
                nulls=null_count,
                unique=unique,
            )
    return stats


# ── CRUD ──


def list_tables(
    search: str | None = None,
    source: str | None = None,
    tag: str | None = None,
) -> list[DataTableMeta]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM data_tables ORDER BY updated_at DESC"
        ).fetchall()

    result = [_row_to_meta(r) for r in rows]

    if search:
        q = search.lower()
        result = [
            t for t in result
            if q in t.name.lower() or q in t.description.lower()
        ]
    if source:
        result = [t for t in result if t.source == source]
    if tag:
        result = [t for t in result if tag in t.tags]

    return result


def get_table(table_id: str) -> DataTableDetail | None:
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM data_tables WHERE id = ?", (table_id,)
        ).fetchone()
    if not row:
        return None
    return _row_to_detail(row)


def create_table(data: DataTableCreate) -> DataTableMeta:
    table_id = data.id or str(uuid.uuid4())
    now = _now_iso()
    gs_json = data.googleSheets.model_dump() if data.googleSheets else None

    with connect() as conn:
        conn.execute(
            """INSERT INTO data_tables
               (id, name, source, description, tags, columns_json, rows_json,
                google_sheets, original_filename, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                table_id,
                data.name,
                data.source,
                data.description,
                json.dumps(data.tags),
                json.dumps([c.model_dump() for c in data.columns]),
                json.dumps(data.rows),
                json.dumps(gs_json) if gs_json else None,
                data.original_filename,
                now,
                now,
            ),
        )
        row = conn.execute(
            "SELECT * FROM data_tables WHERE id = ?", (table_id,)
        ).fetchone()
    return _row_to_meta(row)


def upsert_table(data: DataTableCreate) -> DataTableMeta:
    """Create or fully replace a table (used by frontend migration & Google Sheets refresh)."""
    table_id = data.id or str(uuid.uuid4())
    now = _now_iso()
    gs_json = data.googleSheets.model_dump() if data.googleSheets else None

    with connect() as conn:
        existing = conn.execute(
            "SELECT created_at FROM data_tables WHERE id = ?", (table_id,)
        ).fetchone()
        created = existing["created_at"] if existing else now

        conn.execute(
            """INSERT OR REPLACE INTO data_tables
               (id, name, source, description, tags, columns_json, rows_json,
                google_sheets, original_filename, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                table_id,
                data.name,
                data.source,
                data.description,
                json.dumps(data.tags),
                json.dumps([c.model_dump() for c in data.columns]),
                json.dumps(data.rows),
                json.dumps(gs_json) if gs_json else None,
                data.original_filename,
                created,
                now,
            ),
        )
        row = conn.execute(
            "SELECT * FROM data_tables WHERE id = ?", (table_id,)
        ).fetchone()
    return _row_to_meta(row)


def update_table(table_id: str, updates: DataTableUpdate) -> DataTableMeta | None:
    with connect() as conn:
        existing = conn.execute(
            "SELECT * FROM data_tables WHERE id = ?", (table_id,)
        ).fetchone()
        if not existing:
            return None

        sets: list[str] = []
        params: list = []

        if updates.name is not None:
            sets.append("name = ?")
            params.append(updates.name)
        if updates.description is not None:
            sets.append("description = ?")
            params.append(updates.description)
        if updates.tags is not None:
            sets.append("tags = ?")
            params.append(json.dumps(updates.tags))
        if updates.columns is not None:
            sets.append("columns_json = ?")
            params.append(json.dumps([c.model_dump() for c in updates.columns]))
        if updates.rows is not None:
            sets.append("rows_json = ?")
            params.append(json.dumps(updates.rows))
        if updates.googleSheets is not None:
            sets.append("google_sheets = ?")
            params.append(json.dumps(updates.googleSheets.model_dump()))

        if not sets:
            return _row_to_meta(existing)

        sets.append("updated_at = ?")
        params.append(_now_iso())
        params.append(table_id)

        conn.execute(
            f"UPDATE data_tables SET {', '.join(sets)} WHERE id = ?",
            params,
        )
        row = conn.execute(
            "SELECT * FROM data_tables WHERE id = ?", (table_id,)
        ).fetchone()
    return _row_to_meta(row)


def delete_table(table_id: str) -> bool:
    with connect() as conn:
        cur = conn.execute("DELETE FROM data_tables WHERE id = ?", (table_id,))
        return cur.rowcount > 0
