"""Tests for subscript parsing support."""
import pytest
from app.equations.parser import parse_equation, UnsupportedExpressionError, EquationSyntaxError


class TestSubscriptParsing:
    def test_simple_subscript(self):
        result = parse_equation("Population[North]")
        assert "Population" in result.symbols
        assert "North" not in result.symbols

    def test_subscript_in_expression(self):
        result = parse_equation("a[x] + b")
        assert result.symbols == {"a", "b"}

    def test_subscript_with_arithmetic(self):
        result = parse_equation("Population[North] + Population[South]")
        assert result.symbols == {"Population"}

    def test_numeric_subscript_rejected(self):
        with pytest.raises(UnsupportedExpressionError):
            parse_equation("a[0]")


class TestAggregateFunctions:
    def test_sum_allowed(self):
        result = parse_equation("SUM(Population)")
        assert "Population" in result.symbols

    def test_mean_allowed(self):
        result = parse_equation("MEAN(rates)")
        assert "rates" in result.symbols

    def test_sum_in_expression(self):
        result = parse_equation("SUM(Population) * 0.5")
        assert "Population" in result.symbols
