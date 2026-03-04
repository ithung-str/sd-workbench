from collections import defaultdict
import json
from datetime import datetime, timezone

import pandas as pd
from fastapi import APIRouter
from pydantic import BaseModel

from app.analysis.cache import pipeline_cache
from app.analysis.executor import execute_node
from app.db import connect
from app.schemas.analysis import (
    ExecutePipelineRequest,
    ExecutePipelineResponse,
    NodeResultResponse,
)

router = APIRouter(prefix="/api/analysis", tags=["analysis"])


def _topological_sort(node_ids: list[str], edges: list[dict]) -> list[str]:
    graph: dict[str, list[str]] = defaultdict(list)
    in_degree: dict[str, int] = {nid: 0 for nid in node_ids}
    for edge in edges:
        graph[edge["source"]].append(edge["target"])
        in_degree[edge["target"]] = in_degree.get(edge["target"], 0) + 1
    queue = [nid for nid in node_ids if in_degree[nid] == 0]
    order: list[str] = []
    while queue:
        node = queue.pop(0)
        order.append(node)
        for child in graph[node]:
            in_degree[child] -= 1
            if in_degree[child] == 0:
                queue.append(child)
    return order


def _df_preview(df: pd.DataFrame, max_rows: int = 100) -> dict:
    columns = [{"key": col, "label": col, "type": "number" if pd.api.types.is_numeric_dtype(df[col]) else "string"} for col in df.columns]
    rows = df.head(max_rows).values.tolist()
    dtypes = {col: str(df[col].dtype) for col in df.columns}

    # Compute descriptive stats for numeric columns
    stats: dict[str, dict] = {}
    for col in df.columns:
        col_stats: dict[str, object] = {
            "dtype": str(df[col].dtype),
            "count": int(df[col].count()),
            "nulls": int(df[col].isna().sum()),
        }
        if pd.api.types.is_numeric_dtype(df[col]):
            desc = df[col].describe()
            col_stats.update({
                "mean": None if pd.isna(desc.get("mean")) else round(float(desc["mean"]), 4),
                "std": None if pd.isna(desc.get("std")) else round(float(desc["std"]), 4),
                "min": None if pd.isna(desc.get("min")) else float(desc["min"]),
                "max": None if pd.isna(desc.get("max")) else float(desc["max"]),
                "25%": None if pd.isna(desc.get("25%")) else float(desc["25%"]),
                "50%": None if pd.isna(desc.get("50%")) else float(desc["50%"]),
                "75%": None if pd.isna(desc.get("75%")) else float(desc["75%"]),
            })
        else:
            col_stats.update({
                "unique": int(df[col].nunique()),
            })
        stats[col] = col_stats

    return {"columns": columns, "rows": rows, "dtypes": dtypes, "stats": stats}


@router.post("/execute", response_model=ExecutePipelineResponse)
def execute_pipeline(req: ExecutePipelineRequest) -> ExecutePipelineResponse:
    nodes_by_id = {n.id: n for n in req.nodes}
    edges_raw = [{"source": e.source, "target": e.target} for e in req.edges]

    parent_map: dict[str, list[str]] = defaultdict(list)
    for edge in req.edges:
        parent_map[edge.target].append(edge.source)

    order = _topological_sort(list(nodes_by_id.keys()), edges_raw)
    results: dict[str, NodeResultResponse] = {}
    failed: set[str] = set()

    for node_id in order:
        node = nodes_by_id[node_id]
        parents = parent_map.get(node_id, [])

        if any(p in failed for p in parents):
            results[node_id] = NodeResultResponse(ok=False, error="Upstream node failed")
            failed.add(node_id)
            continue

        # Note node (documentation only, skip execution)
        if node.type == "note":
            results[node_id] = NodeResultResponse(ok=True)
            continue

        # Data Source node
        if node.type == "data_source":
            if not node.data_table:
                results[node_id] = NodeResultResponse(ok=False, error="No data table provided")
                failed.add(node_id)
                continue
            col_keys = [c["key"] for c in node.data_table.columns]
            df = pd.DataFrame(node.data_table.rows, columns=col_keys)
            for col_def in node.data_table.columns:
                if col_def.get("type") == "number":
                    df[col_def["key"]] = pd.to_numeric(df[col_def["key"]], errors="coerce")
            pipeline_cache.set(req.pipeline_id, node_id, df)
            results[node_id] = NodeResultResponse(ok=True, preview=_df_preview(df), shape=list(df.shape))
            continue

        # Output node (pass-through)
        if node.type == "output":
            if parents:
                parent_df = pipeline_cache.get(req.pipeline_id, parents[0])
                if parent_df is not None:
                    pipeline_cache.set(req.pipeline_id, node_id, parent_df)
                    results[node_id] = NodeResultResponse(ok=True, preview=_df_preview(parent_df), shape=list(parent_df.shape))
                    continue
            results[node_id] = NodeResultResponse(ok=False, error="No input data")
            failed.add(node_id)
            continue

        # Code node
        if node.type == "code":
            code = node.code or ""
            inputs: dict[str, pd.DataFrame] = {}
            if len(parents) == 1:
                parent_df = pipeline_cache.get(req.pipeline_id, parents[0])
                if parent_df is not None:
                    inputs["df_in"] = parent_df
            else:
                for i, pid in enumerate(parents):
                    parent_df = pipeline_cache.get(req.pipeline_id, pid)
                    if parent_df is not None:
                        inputs[f"df_in{i + 1}"] = parent_df

            if not inputs:
                results[node_id] = NodeResultResponse(ok=False, error="No input data")
                failed.add(node_id)
                continue

            exec_result = execute_node(code=code, inputs=inputs, timeout=30)
            if exec_result.ok and exec_result.output_df is not None:
                pipeline_cache.set(req.pipeline_id, node_id, exec_result.output_df)
                results[node_id] = NodeResultResponse(
                    ok=True, preview=_df_preview(exec_result.output_df),
                    shape=list(exec_result.output_df.shape), logs=exec_result.logs or None,
                )
            else:
                results[node_id] = NodeResultResponse(ok=False, error=exec_result.error, logs=exec_result.logs or None)
                failed.add(node_id)
            continue

    return ExecutePipelineResponse(results=results)


# ── Pipeline result caching ──


class SaveResultsRequest(BaseModel):
    results: dict[str, dict]


@router.get("/pipelines/{pipeline_id}/results")
def get_pipeline_results(pipeline_id: str) -> dict:
    """Load cached results for a pipeline."""
    with connect() as conn:
        rows = conn.execute(
            "SELECT node_id, result_json FROM pipeline_results WHERE pipeline_id = ?",
            (pipeline_id,),
        ).fetchall()
    results = {}
    for row in rows:
        results[row["node_id"]] = json.loads(row["result_json"])
    return {"results": results}


@router.put("/pipelines/{pipeline_id}/results")
def save_pipeline_results(pipeline_id: str, body: SaveResultsRequest) -> dict:
    """Save/update cached results for a pipeline (merge with existing)."""
    now = datetime.now(timezone.utc).isoformat()
    with connect() as conn:
        for node_id, result in body.results.items():
            conn.execute(
                """INSERT OR REPLACE INTO pipeline_results
                   (pipeline_id, node_id, result_json, updated_at)
                   VALUES (?, ?, ?, ?)""",
                (pipeline_id, node_id, json.dumps(result), now),
            )
    return {"ok": True}


@router.delete("/pipelines/{pipeline_id}/results")
def clear_pipeline_results(pipeline_id: str) -> dict:
    """Clear all cached results for a pipeline."""
    with connect() as conn:
        conn.execute(
            "DELETE FROM pipeline_results WHERE pipeline_id = ?",
            (pipeline_id,),
        )
    return {"ok": True}
