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
    """Create tables if they don't exist."""
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
