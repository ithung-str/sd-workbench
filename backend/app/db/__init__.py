"""SQLite database for persistent data table storage."""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from contextlib import contextmanager
from typing import Iterator

_DB_DIR = Path(__file__).resolve().parents[2] / "data"
_DB_PATH = _DB_DIR / "workbench.db"


def _db_path() -> Path:
    _DB_DIR.mkdir(parents=True, exist_ok=True)
    return _DB_PATH


def init_db() -> None:
    """Create tables if they don't exist and run migrations."""
    with connect() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS data_tables (
                id            TEXT PRIMARY KEY,
                name          TEXT NOT NULL,
                source        TEXT NOT NULL DEFAULT 'csv',
                description   TEXT NOT NULL DEFAULT '',
                tags          TEXT NOT NULL DEFAULT '[]',
                columns_json  TEXT NOT NULL DEFAULT '[]',
                rows_json     TEXT NOT NULL DEFAULT '[]',
                google_sheets TEXT,
                original_filename TEXT,
                created_at    TEXT NOT NULL,
                updated_at    TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS pipeline_results (
                pipeline_id   TEXT NOT NULL,
                node_id       TEXT NOT NULL,
                result_json   TEXT NOT NULL,
                updated_at    TEXT NOT NULL,
                PRIMARY KEY (pipeline_id, node_id)
            );
        """)
        _migrate_assets(conn)


def _has_column(conn: sqlite3.Connection, table: str, column: str) -> bool:
    info = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return any(row["name"] == column for row in info)


def _migrate_assets(conn: sqlite3.Connection) -> None:
    """Add asset columns to data_tables (additive, idempotent)."""
    migrations = [
        ("kind", "TEXT NOT NULL DEFAULT 'table'"),
        ("slug", "TEXT"),
        ("content_text", "TEXT"),
        ("value_json", "TEXT"),
        ("pipeline_id", "TEXT"),
        ("node_id", "TEXT"),
        ("run_at", "TEXT"),
        ("version", "INTEGER NOT NULL DEFAULT 1"),
        ("version_of", "TEXT"),
    ]
    for col_name, col_def in migrations:
        if not _has_column(conn, "data_tables", col_name):
            conn.execute(f"ALTER TABLE data_tables ADD COLUMN {col_name} {col_def}")

    # Create unique index on slug (if not exists)
    conn.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_data_tables_slug
        ON data_tables(slug) WHERE slug IS NOT NULL
    """)


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(str(_db_path()))
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()
