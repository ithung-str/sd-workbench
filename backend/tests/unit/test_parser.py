from __future__ import annotations

import pytest

from app.equations.evaluator import evaluate_expression
from app.equations.parser import UnsupportedExpressionError, extract_symbols, parse_equation



def test_extracts_symbols():
    assert extract_symbols("(a - b) / c") == {"a", "b", "c"}



def test_preserves_operator_precedence():
    assert evaluate_expression("1 + 2 * 3", {}) == 7



def test_rejects_attribute_access():
    with pytest.raises(UnsupportedExpressionError):
        parse_equation("foo.bar")



def test_rejects_unsupported_function():
    with pytest.raises(UnsupportedExpressionError):
        parse_equation("sin(x)")



def test_accepts_supported_function_calls():
    assert evaluate_expression("max(1, abs(-3))", {}) == 3
