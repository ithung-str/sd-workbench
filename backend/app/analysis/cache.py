import pandas as pd


class PipelineCache:
    """In-memory cache for pipeline node results. Keyed by (pipeline_id, node_id)."""

    def __init__(self) -> None:
        self._store: dict[tuple[str, str], pd.DataFrame] = {}

    def get(self, pipeline_id: str, node_id: str) -> pd.DataFrame | None:
        return self._store.get((pipeline_id, node_id))

    def set(self, pipeline_id: str, node_id: str, df: pd.DataFrame) -> None:
        self._store[(pipeline_id, node_id)] = df

    def invalidate(self, pipeline_id: str, node_id: str) -> None:
        self._store.pop((pipeline_id, node_id), None)

    def clear_pipeline(self, pipeline_id: str) -> None:
        keys = [k for k in self._store if k[0] == pipeline_id]
        for k in keys:
            del self._store[k]

    def clear_all(self) -> None:
        self._store.clear()


pipeline_cache = PipelineCache()
