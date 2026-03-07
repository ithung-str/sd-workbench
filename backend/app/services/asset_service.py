"""Business logic for the unified asset layer.

Assets generalize data_tables with kind (table/file/value), slugs,
versioning, and pipeline lineage.
"""
from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timezone

from app.db import connect
from app.schemas.asset import (
    AssetCreate,
    AssetDetail,
    AssetKind,
    AssetLineage,
    AssetMeta,
    AssetPublish,
    AssetUpdate,
    AssetVersionMeta,
)
from app.schemas.data_table import DataColumnSchema, GoogleSheetsMetaSchema
from app.services.data_service import compute_column_stats


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _slugify(name: str) -> str:
    """Convert a name to a URL-safe slug."""
    slug = name.lower().strip()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    slug = slug.strip("-")
    return slug or "asset"


def _unique_slug(slug: str, exclude_id: str | None = None) -> str:
    """Ensure slug is unique by appending a suffix if needed."""
    with connect() as conn:
        candidate = slug
        counter = 1
        while True:
            query = "SELECT id FROM data_tables WHERE slug = ?"
            params: list = [candidate]
            if exclude_id:
                query += " AND id != ?"
                params.append(exclude_id)
            existing = conn.execute(query, params).fetchone()
            if not existing:
                return candidate
            counter += 1
            candidate = f"{slug}-{counter}"


def _row_to_meta(row) -> AssetMeta:
    cols_raw = json.loads(row["columns_json"]) if row["columns_json"] else None
    rows_data = json.loads(row["rows_json"]) if row["rows_json"] else None
    gs = json.loads(row["google_sheets"]) if row["google_sheets"] else None
    tags = json.loads(row["tags"]) if row["tags"] else []
    kind = row["kind"] if "kind" in row.keys() else "table"

    lineage = None
    pipeline_id = row["pipeline_id"] if "pipeline_id" in row.keys() else None
    node_id = row["node_id"] if "node_id" in row.keys() else None
    if pipeline_id:
        run_at = row["run_at"] if "run_at" in row.keys() else None
        lineage = AssetLineage(pipeline_id=pipeline_id, node_id=node_id or "", run_at=run_at)

    columns = [DataColumnSchema(**c) for c in cols_raw] if cols_raw else None
    row_count = len(rows_data) if rows_data is not None else None

    version = row["version"] if "version" in row.keys() else 1
    slug = row["slug"] if "slug" in row.keys() else None

    return AssetMeta(
        id=row["id"],
        slug=slug,
        name=row["name"],
        kind=kind,
        source=row["source"],
        description=row["description"] or "",
        tags=tags,
        version=version,
        versions_count=1,  # filled by caller if needed
        lineage=lineage,
        columns=columns,
        row_count=row_count,
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        google_sheets=GoogleSheetsMetaSchema(**gs) if gs else None,
        original_filename=row["original_filename"] if "original_filename" in row.keys() else None,
    )


def _row_to_detail(row) -> AssetDetail:
    meta = _row_to_meta(row)
    kind = meta.kind

    rows_data = json.loads(row["rows_json"]) if row["rows_json"] else None
    content_text = row["content_text"] if "content_text" in row.keys() else None
    value_json = row["value_json"] if "value_json" in row.keys() else None

    column_stats = None
    if kind == AssetKind.table and meta.columns and rows_data:
        column_stats = compute_column_stats(meta.columns, rows_data)

    value = json.loads(value_json) if value_json else None

    return AssetDetail(
        **meta.model_dump(),
        rows=rows_data if kind == AssetKind.table else None,
        column_stats=column_stats,
        content_text=content_text if kind == AssetKind.file else None,
        value=value if kind == AssetKind.value else None,
    )


def _versions_count(conn, asset_id: str) -> int:
    """Count all versions for an asset (including the original)."""
    row = conn.execute(
        "SELECT COUNT(*) as cnt FROM data_tables WHERE id = ? OR version_of = ?",
        (asset_id, asset_id),
    ).fetchone()
    return row["cnt"] if row else 1


# ── List / Get ──


def list_assets(
    *,
    kind: str | None = None,
    source: str | None = None,
    tag: str | None = None,
    search: str | None = None,
    pipeline_id: str | None = None,
) -> list[AssetMeta]:
    """List assets (excludes old versions by default)."""
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM data_tables WHERE version_of IS NULL ORDER BY updated_at DESC"
        ).fetchall()

    result = [_row_to_meta(r) for r in rows]

    if kind:
        result = [a for a in result if a.kind == kind]
    if source:
        result = [a for a in result if a.source == source]
    if tag:
        result = [a for a in result if tag in a.tags]
    if search:
        q = search.lower()
        result = [a for a in result if q in a.name.lower() or q in a.description.lower()]
    if pipeline_id:
        result = [a for a in result if a.lineage and a.lineage.pipeline_id == pipeline_id]

    return result


def get_asset(asset_id: str) -> AssetDetail | None:
    with connect() as conn:
        row = conn.execute("SELECT * FROM data_tables WHERE id = ?", (asset_id,)).fetchone()
        if not row:
            return None
        detail = _row_to_detail(row)
        # Find the root id for version counting
        root_id = row["version_of"] if row["version_of"] else asset_id
        detail.versions_count = _versions_count(conn, root_id)
        return detail


def get_asset_by_slug(slug: str) -> AssetDetail | None:
    """Get the latest version of an asset by slug."""
    with connect() as conn:
        # Find the original asset with this slug
        original = conn.execute(
            "SELECT id FROM data_tables WHERE slug = ? AND version_of IS NULL", (slug,)
        ).fetchone()
        if not original:
            return None
        original_id = original["id"]

        # Get the latest version (highest version number)
        latest = conn.execute(
            """SELECT * FROM data_tables
               WHERE (id = ? OR version_of = ?)
               ORDER BY version DESC LIMIT 1""",
            (original_id, original_id),
        ).fetchone()
        if not latest:
            return None

        detail = _row_to_detail(latest)
        detail.versions_count = _versions_count(conn, original_id)
        # Ensure slug is on the response even for version rows
        detail.slug = slug
        return detail


def get_asset_versions(asset_id: str) -> list[AssetVersionMeta]:
    """Get version history for an asset."""
    with connect() as conn:
        # asset_id might be a version or the original
        original = conn.execute("SELECT * FROM data_tables WHERE id = ?", (asset_id,)).fetchone()
        if not original:
            return []
        root_id = original["version_of"] or asset_id

        rows = conn.execute(
            """SELECT * FROM data_tables
               WHERE id = ? OR version_of = ?
               ORDER BY version DESC""",
            (root_id, root_id),
        ).fetchall()

    result = []
    for r in rows:
        rows_data = json.loads(r["rows_json"]) if r["rows_json"] else None
        pipeline_id = r["pipeline_id"] if "pipeline_id" in r.keys() else None
        node_id = r["node_id"] if "node_id" in r.keys() else None
        lineage = None
        if pipeline_id:
            run_at = r["run_at"] if "run_at" in r.keys() else None
            lineage = AssetLineage(pipeline_id=pipeline_id, node_id=node_id or "", run_at=run_at)
        result.append(AssetVersionMeta(
            id=r["id"],
            version=r["version"] if "version" in r.keys() else 1,
            created_at=r["created_at"],
            updated_at=r["updated_at"],
            row_count=len(rows_data) if rows_data is not None else None,
            lineage=lineage,
        ))
    return result


# ── Create / Update / Delete ──


def create_asset(data: AssetCreate) -> AssetMeta:
    asset_id = data.id or str(uuid.uuid4())
    now = _now_iso()
    slug = _unique_slug(data.slug or _slugify(data.name))
    gs_json = data.google_sheets.model_dump() if data.google_sheets else None

    lineage = data.lineage
    columns_json = json.dumps([c.model_dump() for c in data.columns]) if data.columns else "[]"
    rows_json = json.dumps(data.rows) if data.rows is not None else "[]"
    value_json = json.dumps(data.value) if data.value is not None else None

    with connect() as conn:
        conn.execute(
            """INSERT INTO data_tables
               (id, name, source, description, tags, columns_json, rows_json,
                google_sheets, original_filename, created_at, updated_at,
                kind, slug, content_text, value_json,
                pipeline_id, node_id, run_at, version, version_of)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                       ?, ?, ?, ?, ?, ?, ?, 1, NULL)""",
            (
                asset_id,
                data.name,
                data.source,
                data.description,
                json.dumps(data.tags),
                columns_json,
                rows_json,
                json.dumps(gs_json) if gs_json else None,
                data.original_filename,
                now,
                now,
                data.kind.value,
                slug,
                data.content_text,
                value_json,
                lineage.pipeline_id if lineage else None,
                lineage.node_id if lineage else None,
                lineage.run_at if lineage else None,
            ),
        )
        row = conn.execute("SELECT * FROM data_tables WHERE id = ?", (asset_id,)).fetchone()
    return _row_to_meta(row)


def update_asset(asset_id: str, updates: AssetUpdate) -> AssetMeta | None:
    with connect() as conn:
        existing = conn.execute("SELECT * FROM data_tables WHERE id = ?", (asset_id,)).fetchone()
        if not existing:
            return None

        sets: list[str] = []
        params: list = []

        if updates.name is not None:
            sets.append("name = ?")
            params.append(updates.name)
        if updates.slug is not None:
            new_slug = _unique_slug(updates.slug, exclude_id=asset_id)
            sets.append("slug = ?")
            params.append(new_slug)
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
        if updates.content_text is not None:
            sets.append("content_text = ?")
            params.append(updates.content_text)
        if updates.value is not None:
            sets.append("value_json = ?")
            params.append(json.dumps(updates.value))
        if updates.google_sheets is not None:
            sets.append("google_sheets = ?")
            params.append(json.dumps(updates.google_sheets.model_dump()))

        if not sets:
            return _row_to_meta(existing)

        sets.append("updated_at = ?")
        params.append(_now_iso())
        params.append(asset_id)

        conn.execute(f"UPDATE data_tables SET {', '.join(sets)} WHERE id = ?", params)
        row = conn.execute("SELECT * FROM data_tables WHERE id = ?", (asset_id,)).fetchone()
    return _row_to_meta(row)


def upsert_asset(data: AssetCreate) -> AssetMeta:
    """Create or fully replace an asset (preserves created_at)."""
    asset_id = data.id or str(uuid.uuid4())
    now = _now_iso()
    gs_json = data.google_sheets.model_dump() if data.google_sheets else None
    lineage = data.lineage
    columns_json = json.dumps([c.model_dump() for c in data.columns]) if data.columns else "[]"
    rows_json = json.dumps(data.rows) if data.rows is not None else "[]"
    value_json = json.dumps(data.value) if data.value is not None else None

    with connect() as conn:
        existing = conn.execute("SELECT created_at, slug, version FROM data_tables WHERE id = ?", (asset_id,)).fetchone()
        created = existing["created_at"] if existing else now
        slug = data.slug or (existing["slug"] if existing and existing["slug"] else _slugify(data.name))
        slug = _unique_slug(slug, exclude_id=asset_id)
        version = existing["version"] if existing else 1

        conn.execute(
            """INSERT OR REPLACE INTO data_tables
               (id, name, source, description, tags, columns_json, rows_json,
                google_sheets, original_filename, created_at, updated_at,
                kind, slug, content_text, value_json,
                pipeline_id, node_id, run_at, version, version_of)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                       ?, ?, ?, ?, ?, ?, ?, ?, NULL)""",
            (
                asset_id,
                data.name,
                data.source,
                data.description,
                json.dumps(data.tags),
                columns_json,
                rows_json,
                json.dumps(gs_json) if gs_json else None,
                data.original_filename,
                created,
                now,
                data.kind.value,
                slug,
                data.content_text,
                value_json,
                lineage.pipeline_id if lineage else None,
                lineage.node_id if lineage else None,
                lineage.run_at if lineage else None,
                version,
            ),
        )
        row = conn.execute("SELECT * FROM data_tables WHERE id = ?", (asset_id,)).fetchone()
    return _row_to_meta(row)


def delete_asset(asset_id: str) -> bool:
    """Delete an asset and all its versions."""
    with connect() as conn:
        # Delete versions first
        conn.execute("DELETE FROM data_tables WHERE version_of = ?", (asset_id,))
        cur = conn.execute("DELETE FROM data_tables WHERE id = ?", (asset_id,))
        return cur.rowcount > 0


def publish_version(asset_id: str, data: AssetPublish) -> AssetMeta:
    """Create a new version of an existing asset."""
    now = _now_iso()
    version_id = str(uuid.uuid4())

    with connect() as conn:
        original = conn.execute("SELECT * FROM data_tables WHERE id = ?", (asset_id,)).fetchone()
        if not original:
            raise ValueError(f"Asset {asset_id} not found")

        # Find current max version
        max_ver = conn.execute(
            "SELECT MAX(version) as mv FROM data_tables WHERE id = ? OR version_of = ?",
            (asset_id, asset_id),
        ).fetchone()
        new_version = (max_ver["mv"] or 1) + 1

        # Use provided content or carry forward from original
        columns_json = json.dumps([c.model_dump() for c in data.columns]) if data.columns else original["columns_json"]
        rows_json = json.dumps(data.rows) if data.rows is not None else original["rows_json"]
        content_text = data.content_text if data.content_text is not None else (original["content_text"] if "content_text" in original.keys() else None)
        value_json = json.dumps(data.value) if data.value is not None else (original["value_json"] if "value_json" in original.keys() else None)

        lineage = data.lineage

        conn.execute(
            """INSERT INTO data_tables
               (id, name, source, description, tags, columns_json, rows_json,
                google_sheets, original_filename, created_at, updated_at,
                kind, slug, content_text, value_json,
                pipeline_id, node_id, run_at, version, version_of)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                       ?, NULL, ?, ?, ?, ?, ?, ?, ?)""",
            (
                version_id,
                original["name"],
                original["source"],
                original["description"],
                original["tags"],
                columns_json,
                rows_json,
                original["google_sheets"],
                original["original_filename"] if "original_filename" in original.keys() else None,
                now,
                now,
                original["kind"] if "kind" in original.keys() else "table",
                content_text,
                value_json,
                lineage.pipeline_id if lineage else None,
                lineage.node_id if lineage else None,
                lineage.run_at if lineage else None,
                new_version,
                asset_id,
            ),
        )

        # Also update the original's updated_at so it sorts to top
        conn.execute("UPDATE data_tables SET updated_at = ? WHERE id = ?", (now, asset_id))

        row = conn.execute("SELECT * FROM data_tables WHERE id = ?", (version_id,)).fetchone()

    meta = _row_to_meta(row)
    meta.slug = original["slug"] if "slug" in original.keys() else None
    return meta


# ── Data export helpers ──


def get_asset_data_csv(asset_id: str) -> str | None:
    """Export asset data as CSV string."""
    import csv
    import io

    detail = get_asset(asset_id)
    if not detail or detail.kind != AssetKind.table or not detail.columns or detail.rows is None:
        return None

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([col.label for col in detail.columns])
    for row in detail.rows:
        writer.writerow(row)
    return buf.getvalue()


def get_asset_data_yaml(asset_id: str) -> str | None:
    """Export asset data as YAML string (uses json for now, yaml if available)."""
    detail = get_asset(asset_id)
    if not detail:
        return None

    if detail.kind == AssetKind.table and detail.columns and detail.rows is not None:
        data = {
            "columns": [c.model_dump() for c in detail.columns],
            "rows": detail.rows,
        }
    elif detail.kind == AssetKind.file:
        return detail.content_text
    elif detail.kind == AssetKind.value:
        data = detail.value
    else:
        return None

    try:
        import yaml
        return yaml.dump(data, default_flow_style=False, allow_unicode=True)
    except ImportError:
        return json.dumps(data, indent=2)
