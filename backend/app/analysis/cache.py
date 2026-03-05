from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import pandas as pd


# Value kinds that can flow through pipeline edges
VALUE_KINDS = ("dataframe", "scalar", "dict", "list", "text", "image")


@dataclass
class NodeValue:
    """Generic wrapper for any value flowing through the pipeline."""

    kind: str  # one of VALUE_KINDS
    value: Any  # the actual Python object
    label: str = ""  # short human-readable summary

    @staticmethod
    def from_dataframe(df: pd.DataFrame) -> "NodeValue":
        return NodeValue(kind="dataframe", value=df, label=f"{df.shape[0]}×{df.shape[1]} DataFrame")

    @staticmethod
    def from_scalar(val: Any) -> "NodeValue":
        return NodeValue(kind="scalar", value=val, label=str(val)[:80])

    @staticmethod
    def from_dict(val: dict) -> "NodeValue":
        return NodeValue(kind="dict", value=val, label=f"dict ({len(val)} keys)")

    @staticmethod
    def from_list(val: list) -> "NodeValue":
        return NodeValue(kind="list", value=val, label=f"list ({len(val)} items)")

    @staticmethod
    def from_text(val: str) -> "NodeValue":
        return NodeValue(kind="text", value=val, label=f"text ({len(val)} chars)")

    @staticmethod
    def from_any(val: Any) -> "NodeValue":
        """Auto-detect kind from Python value."""
        if isinstance(val, pd.DataFrame):
            return NodeValue.from_dataframe(val)
        if isinstance(val, dict):
            return NodeValue.from_dict(val)
        if isinstance(val, list):
            return NodeValue.from_list(val)
        if isinstance(val, str) and len(val) > 100:
            return NodeValue.from_text(val)
        return NodeValue.from_scalar(val)

    @property
    def as_dataframe(self) -> pd.DataFrame | None:
        """Try to get a DataFrame, with auto-coercion for compatible types."""
        if self.kind == "dataframe":
            return self.value
        if self.kind == "dict":
            # dict of lists → DataFrame
            try:
                return pd.DataFrame(self.value)
            except Exception:
                # single-row dict
                try:
                    return pd.DataFrame([self.value])
                except Exception:
                    return None
        if self.kind == "list":
            try:
                return pd.DataFrame(self.value)
            except Exception:
                return None
        return None


class PipelineCache:
    """In-memory cache for pipeline node results. Keyed by (pipeline_id, node_id)."""

    def __init__(self) -> None:
        self._store: dict[tuple[str, str], NodeValue] = {}

    def get(self, pipeline_id: str, node_id: str) -> pd.DataFrame | None:
        """Get value as DataFrame (backward compat). Returns None if not coercible."""
        nv = self.get_value(pipeline_id, node_id)
        if nv is None:
            return None
        return nv.as_dataframe

    def get_value(self, pipeline_id: str, node_id: str) -> NodeValue | None:
        return self._store.get((pipeline_id, node_id))

    def set(self, pipeline_id: str, node_id: str, df: pd.DataFrame) -> None:
        """Set a DataFrame value (backward compat)."""
        self._store[(pipeline_id, node_id)] = NodeValue.from_dataframe(df)

    def set_value(self, pipeline_id: str, node_id: str, nv: NodeValue) -> None:
        self._store[(pipeline_id, node_id)] = nv

    def invalidate(self, pipeline_id: str, node_id: str) -> None:
        self._store.pop((pipeline_id, node_id), None)

    def clear_pipeline(self, pipeline_id: str) -> None:
        keys = [k for k in self._store if k[0] == pipeline_id]
        for k in keys:
            del self._store[k]

    def clear_all(self) -> None:
        self._store.clear()


pipeline_cache = PipelineCache()
