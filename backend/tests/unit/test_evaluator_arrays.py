"""Tests for array-aware equation evaluation."""
import numpy as np
import pytest
from app.equations.evaluator import evaluate_expression, DimensionContext


@pytest.fixture
def dim_ctx():
    return DimensionContext(
        dimensions={"Region": ["North", "South", "East"]},
        node_dimensions={"Population": ["Region"], "birth_rate": ["Region"]},
    )


class TestScalarBackwardsCompat:
    """Existing scalar behaviour must not break."""

    def test_scalar_add(self):
        assert evaluate_expression("a + b", {"a": 1.0, "b": 2.0}) == 3.0

    def test_scalar_function(self):
        result = evaluate_expression("abs(x)", {"x": -5.0})
        assert result == 5.0


class TestArrayEvaluation:
    def test_array_name_returns_array(self, dim_ctx):
        ctx = {"Population": np.array([100.0, 200.0, 300.0])}
        result = evaluate_expression("Population", ctx, dim_ctx)
        np.testing.assert_array_equal(result, [100.0, 200.0, 300.0])

    def test_scalar_times_array(self, dim_ctx):
        ctx = {"rate": 0.1, "Population": np.array([100.0, 200.0, 300.0])}
        result = evaluate_expression("rate * Population", ctx, dim_ctx)
        np.testing.assert_array_almost_equal(result, [10.0, 20.0, 30.0])

    def test_array_plus_array(self, dim_ctx):
        ctx = {
            "a": np.array([1.0, 2.0, 3.0]),
            "b": np.array([10.0, 20.0, 30.0]),
        }
        result = evaluate_expression("a + b", ctx, dim_ctx)
        np.testing.assert_array_equal(result, [11.0, 22.0, 33.0])


class TestSubscriptIndexing:
    def test_index_by_element_name(self, dim_ctx):
        ctx = {"Population": np.array([100.0, 200.0, 300.0])}
        result = evaluate_expression("Population[North]", ctx, dim_ctx)
        assert result == 100.0

    def test_index_last_element(self, dim_ctx):
        ctx = {"Population": np.array([100.0, 200.0, 300.0])}
        result = evaluate_expression("Population[East]", ctx, dim_ctx)
        assert result == 300.0

    def test_cross_element_arithmetic(self, dim_ctx):
        ctx = {"Population": np.array([100.0, 200.0, 300.0])}
        result = evaluate_expression("Population[North] + Population[South]", ctx, dim_ctx)
        assert result == 300.0


class TestAggregateFunctions:
    def test_sum(self, dim_ctx):
        ctx = {"Population": np.array([100.0, 200.0, 300.0])}
        result = evaluate_expression("SUM(Population)", ctx, dim_ctx)
        assert result == 600.0

    def test_mean(self, dim_ctx):
        ctx = {"Population": np.array([100.0, 200.0, 300.0])}
        result = evaluate_expression("MEAN(Population)", ctx, dim_ctx)
        assert result == 200.0

    def test_sum_in_expression(self, dim_ctx):
        ctx = {"Population": np.array([100.0, 200.0, 300.0])}
        result = evaluate_expression("SUM(Population) * 0.5", ctx, dim_ctx)
        assert result == 300.0


class TestArrayFunctions:
    def test_abs_elementwise(self, dim_ctx):
        ctx = {"x": np.array([-1.0, 2.0, -3.0])}
        result = evaluate_expression("abs(x)", ctx, dim_ctx)
        np.testing.assert_array_equal(result, [1.0, 2.0, 3.0])

    def test_if_then_else_with_array(self, dim_ctx):
        ctx = {
            "cond": np.array([1.0, 0.0, 1.0]),
            "a": np.array([10.0, 20.0, 30.0]),
            "b": np.array([100.0, 200.0, 300.0]),
        }
        result = evaluate_expression("if_then_else(cond, a, b)", ctx, dim_ctx)
        np.testing.assert_array_equal(result, [10.0, 200.0, 30.0])
