"""Execute SQL queries against pandas DataFrames using DuckDB."""
from __future__ import annotations

from dataclasses import dataclass

import pandas as pd


@dataclass
class SqlResult:
    ok: bool
    output_df: pd.DataFrame | None = None
    error: str | None = None


def execute_sql(
    sql: str,
    inputs: dict[str, pd.DataFrame],
) -> SqlResult:
    """Run a SQL query against named DataFrames. Each input is registered as a table."""
    try:
        import duckdb
    except ImportError:
        return SqlResult(ok=False, error="duckdb is required for SQL nodes; install via: pip install duckdb")
    try:
        conn = duckdb.connect(":memory:")
        for name, df in inputs.items():
            conn.register(name, df)
        result_df = conn.execute(sql).fetchdf()
        conn.close()
        return SqlResult(ok=True, output_df=result_df)
    except Exception as e:
        return SqlResult(ok=False, error=str(e))
