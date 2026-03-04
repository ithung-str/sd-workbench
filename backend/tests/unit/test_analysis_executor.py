import pandas as pd
import pytest
from app.analysis.executor import execute_node, NodeResult
from app.analysis.cache import PipelineCache


def test_execute_simple_code():
    input_df = pd.DataFrame({"x": [1, 2, 3]})
    result = execute_node(code="df['y'] = df['x'] * 2", inputs={"df": input_df}, timeout=30)
    assert result.ok
    assert result.output_df is not None
    assert list(result.output_df["y"]) == [2, 4, 6]


def test_execute_syntax_error():
    input_df = pd.DataFrame({"x": [1]})
    result = execute_node(code="df['y' = bad syntax", inputs={"df": input_df}, timeout=30)
    assert not result.ok
    assert result.error is not None
    assert "SyntaxError" in result.error


def test_execute_runtime_error():
    input_df = pd.DataFrame({"x": [1]})
    result = execute_node(code="df = df['nonexistent_column']", inputs={"df": input_df}, timeout=30)
    assert not result.ok
    assert result.error is not None


def test_execute_timeout():
    input_df = pd.DataFrame({"x": [1]})
    result = execute_node(code="while True: pass", inputs={"df": input_df}, timeout=2)
    assert not result.ok
    assert "timeout" in (result.error or "").lower()


def test_execute_multiple_inputs():
    df1 = pd.DataFrame({"a": [1, 2]})
    df2 = pd.DataFrame({"b": [3, 4]})
    result = execute_node(code="df = pd.concat([df1, df2], axis=1)", inputs={"df1": df1, "df2": df2}, timeout=30)
    assert result.ok
    assert list(result.output_df.columns) == ["a", "b"]


def test_cache_store_and_retrieve():
    cache = PipelineCache()
    test_df = pd.DataFrame({"x": [1, 2, 3]})
    cache.set("pipe1", "node1", test_df)
    result = cache.get("pipe1", "node1")
    assert result is not None
    assert list(result["x"]) == [1, 2, 3]


def test_cache_invalidate():
    cache = PipelineCache()
    cache.set("pipe1", "n1", pd.DataFrame({"x": [1]}))
    cache.set("pipe1", "n2", pd.DataFrame({"x": [2]}))
    cache.invalidate("pipe1", "n1")
    assert cache.get("pipe1", "n1") is None
    assert cache.get("pipe1", "n2") is not None


def test_cache_clear_pipeline():
    cache = PipelineCache()
    cache.set("pipe1", "n1", pd.DataFrame({"x": [1]}))
    cache.set("pipe1", "n2", pd.DataFrame({"x": [2]}))
    cache.clear_pipeline("pipe1")
    assert cache.get("pipe1", "n1") is None
    assert cache.get("pipe1", "n2") is None
