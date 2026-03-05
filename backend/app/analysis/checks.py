"""
sdw_checks — reusable validation helpers for analysis pipeline code nodes.

Import in code nodes as:
    from sdw_checks import assert_no_explode, assert_no_nulls, assert_unique, ...

All functions raise ``CheckError`` on failure, which the runner surfaces as
a node error with a clear message.
"""
from __future__ import annotations

from typing import Sequence

import pandas as pd


class CheckError(Exception):
    """Raised when a validation check fails."""


# ---------------------------------------------------------------------------
# Row-count guards
# ---------------------------------------------------------------------------

def assert_no_explode(
    df: pd.DataFrame,
    reference: pd.DataFrame,
    *,
    factor: float = 2.0,
    label: str = "",
) -> None:
    """Fail if *df* has more than ``factor``× the rows of *reference*.

    Catches accidental many-to-many joins that silently blow up row counts.
    """
    if len(reference) == 0:
        return
    ratio = len(df) / len(reference)
    if ratio > factor:
        ctx = f" ({label})" if label else ""
        raise CheckError(
            f"Row explosion{ctx}: output has {len(df):,} rows "
            f"({ratio:.1f}× the {len(reference):,} input rows, limit {factor}×)"
        )


def assert_no_shrink(
    df: pd.DataFrame,
    reference: pd.DataFrame,
    *,
    factor: float = 0.5,
    label: str = "",
) -> None:
    """Fail if *df* has fewer than ``factor``× the rows of *reference*."""
    if len(reference) == 0:
        return
    ratio = len(df) / len(reference)
    if ratio < factor:
        ctx = f" ({label})" if label else ""
        raise CheckError(
            f"Row shrink{ctx}: output has {len(df):,} rows "
            f"({ratio:.1%} of the {len(reference):,} input rows, limit {factor:.0%})"
        )


def assert_row_count(
    df: pd.DataFrame,
    *,
    min: int | None = None,  # noqa: A002 — shadowing builtin is fine here
    max: int | None = None,  # noqa: A002
    label: str = "",
) -> None:
    """Fail if row count is outside [min, max]."""
    n = len(df)
    ctx = f" ({label})" if label else ""
    if min is not None and n < min:
        raise CheckError(f"Too few rows{ctx}: {n:,} < {min:,}")
    if max is not None and n > max:
        raise CheckError(f"Too many rows{ctx}: {n:,} > {max:,}")


# ---------------------------------------------------------------------------
# Null / duplicate checks
# ---------------------------------------------------------------------------

def assert_no_nulls(
    df: pd.DataFrame,
    columns: Sequence[str] | None = None,
    *,
    label: str = "",
) -> None:
    """Fail if any of *columns* (default: all) contain nulls."""
    cols = list(columns) if columns else list(df.columns)
    missing = [c for c in cols if c not in df.columns]
    if missing:
        raise CheckError(f"Columns not found: {missing}")
    null_counts = df[cols].isnull().sum()
    bad = null_counts[null_counts > 0]
    if len(bad) > 0:
        ctx = f" ({label})" if label else ""
        details = ", ".join(f"{c}: {int(v)}" for c, v in bad.items())
        raise CheckError(f"Null values found{ctx}: {details}")


def assert_unique(
    df: pd.DataFrame,
    columns: Sequence[str],
    *,
    label: str = "",
) -> None:
    """Fail if *columns* are not unique (i.e. duplicates exist)."""
    cols = list(columns)
    missing = [c for c in cols if c not in df.columns]
    if missing:
        raise CheckError(f"Columns not found: {missing}")
    n_dupes = df.duplicated(subset=cols).sum()
    if n_dupes > 0:
        ctx = f" ({label})" if label else ""
        raise CheckError(
            f"Duplicate rows{ctx}: {n_dupes:,} duplicates on {cols}"
        )


def assert_no_duplicates(
    df: pd.DataFrame,
    columns: Sequence[str] | None = None,
    *,
    label: str = "",
) -> None:
    """Alias for assert_unique over all columns (or a subset)."""
    cols = list(columns) if columns else list(df.columns)
    assert_unique(df, cols, label=label)


# ---------------------------------------------------------------------------
# Schema checks
# ---------------------------------------------------------------------------

def assert_columns_exist(
    df: pd.DataFrame,
    columns: Sequence[str],
    *,
    label: str = "",
) -> None:
    """Fail if any of *columns* are missing from *df*."""
    missing = [c for c in columns if c not in df.columns]
    if missing:
        ctx = f" ({label})" if label else ""
        raise CheckError(f"Missing columns{ctx}: {missing}")


def assert_dtypes(
    df: pd.DataFrame,
    expected: dict[str, str],
    *,
    label: str = "",
) -> None:
    """Fail if column dtypes don't match expected (by kind name).

    Example: ``assert_dtypes(df, {"date": "datetime", "value": "float"})``
    Matches against ``dtype.kind`` names: i=int, f=float, O=object, M=datetime, etc.
    """
    KIND_MAP = {
        "int": "i", "integer": "i",
        "float": "f",
        "str": "O", "string": "O", "object": "O",
        "bool": "b", "boolean": "b",
        "datetime": "M", "date": "M",
        "timedelta": "m",
        "category": "?",  # special
    }
    ctx = f" ({label})" if label else ""
    for col, expected_type in expected.items():
        if col not in df.columns:
            raise CheckError(f"Column '{col}' not found{ctx}")
        actual_kind = df[col].dtype.kind
        if expected_type == "category":
            if not isinstance(df[col].dtype, pd.CategoricalDtype):
                raise CheckError(f"Column '{col}'{ctx}: expected category, got {df[col].dtype}")
        else:
            expected_kind = KIND_MAP.get(expected_type.lower(), expected_type)
            if actual_kind != expected_kind:
                raise CheckError(
                    f"Column '{col}'{ctx}: expected {expected_type} (kind={expected_kind}), "
                    f"got {df[col].dtype} (kind={actual_kind})"
                )


# ---------------------------------------------------------------------------
# Value-range checks
# ---------------------------------------------------------------------------

def assert_in_range(
    df: pd.DataFrame,
    column: str,
    *,
    min: float | None = None,  # noqa: A002
    max: float | None = None,  # noqa: A002
    label: str = "",
) -> None:
    """Fail if any values in *column* fall outside [min, max]."""
    if column not in df.columns:
        raise CheckError(f"Column '{column}' not found")
    ctx = f" ({label})" if label else ""
    s = df[column].dropna()
    if min is not None and (s < min).any():
        actual_min = s.min()
        raise CheckError(f"Values below minimum{ctx}: {column} has min={actual_min}, limit={min}")
    if max is not None and (s > max).any():
        actual_max = s.max()
        raise CheckError(f"Values above maximum{ctx}: {column} has max={actual_max}, limit={max}")


def assert_positive(
    df: pd.DataFrame,
    columns: Sequence[str],
    *,
    label: str = "",
) -> None:
    """Fail if any values in *columns* are negative."""
    for col in columns:
        assert_in_range(df, col, min=0, label=label or col)


# ---------------------------------------------------------------------------
# Shape comparison
# ---------------------------------------------------------------------------

def assert_same_shape(
    df: pd.DataFrame,
    reference: pd.DataFrame,
    *,
    check_rows: bool = True,
    check_cols: bool = True,
    label: str = "",
) -> None:
    """Fail if *df* doesn't match *reference* shape."""
    ctx = f" ({label})" if label else ""
    if check_rows and len(df) != len(reference):
        raise CheckError(f"Row count mismatch{ctx}: {len(df):,} vs {len(reference):,}")
    if check_cols and len(df.columns) != len(reference.columns):
        raise CheckError(f"Column count mismatch{ctx}: {len(df.columns)} vs {len(reference.columns)}")
