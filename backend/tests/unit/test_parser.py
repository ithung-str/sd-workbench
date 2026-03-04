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
        parse_equation("eval(x)")



def test_accepts_supported_function_calls():
    assert evaluate_expression("max(1, abs(-3))", {}) == 3



def test_accepts_delay_functions():
    parsed = parse_equation("delay3(x, 10)")
    assert parsed.symbols == {"x"}


def test_delay_extracts_symbols():
    assert extract_symbols("delay3(input_rate, T)") == {"input_rate", "T"}


def test_delay1_parses():
    parsed = parse_equation("delay1(a, 5)")
    assert parsed.symbols == {"a"}


def test_delayn_parses():
    parsed = parse_equation("delayn(a, 10, 4)")
    assert parsed.symbols == {"a"}


# --- Comparison operators ---

def test_comparison_greater_than():
    parsed = parse_equation("x > 5")
    assert parsed.symbols == {"x"}


def test_comparison_less_equal():
    parsed = parse_equation("x <= y")
    assert parsed.symbols == {"x", "y"}


def test_comparison_evaluates_true():
    assert evaluate_expression("10 > 5", {}) == 1.0


def test_comparison_evaluates_false():
    assert evaluate_expression("3 > 5", {}) == 0.0


def test_comparison_eq():
    assert evaluate_expression("5 == 5", {}) == 1.0


def test_comparison_neq():
    assert evaluate_expression("5 != 3", {}) == 1.0


# --- if_then_else ---

def test_if_then_else_true():
    assert evaluate_expression("if_then_else(1, 10, 20)", {}) == 10.0


def test_if_then_else_false():
    assert evaluate_expression("if_then_else(0, 10, 20)", {}) == 20.0


def test_if_then_else_with_comparison():
    assert evaluate_expression("if_then_else(x > 5, 100, 0)", {"x": 10}) == 100.0


def test_if_then_else_symbols():
    parsed = parse_equation("if_then_else(x > 5, y, z)")
    assert parsed.symbols == {"x", "y", "z"}


# --- TIME variable ---

def test_time_in_equation():
    parsed = parse_equation("TIME * 2")
    assert "TIME" in parsed.symbols


# --- Time-input functions ---

def test_step_parses():
    parsed = parse_equation("step(100, 5)")
    assert parsed.symbols == set()


def test_step_evaluates():
    assert evaluate_expression("step(100, 5)", {"TIME": 3}) == 0.0
    assert evaluate_expression("step(100, 5)", {"TIME": 5}) == 100.0
    assert evaluate_expression("step(100, 5)", {"TIME": 10}) == 100.0


def test_ramp_evaluates():
    assert evaluate_expression("ramp(2, 5, 10)", {"TIME": 3}) == 0.0
    assert evaluate_expression("ramp(2, 5, 10)", {"TIME": 7}) == 4.0
    assert evaluate_expression("ramp(2, 5, 10)", {"TIME": 15}) == 10.0


def test_pulse_evaluates():
    assert evaluate_expression("pulse(50, 5, 3)", {"TIME": 4}) == 0.0
    assert evaluate_expression("pulse(50, 5, 3)", {"TIME": 5}) == 50.0
    assert evaluate_expression("pulse(50, 5, 3)", {"TIME": 7.9}) == 50.0
    assert evaluate_expression("pulse(50, 5, 3)", {"TIME": 8}) == 0.0


def test_pulse_train_evaluates():
    assert evaluate_expression("pulse_train(10, 5, 10, 100)", {"TIME": 5}) == 10.0
    assert evaluate_expression("pulse_train(10, 5, 10, 100)", {"TIME": 15}) == 10.0
    assert evaluate_expression("pulse_train(10, 5, 10, 100)", {"TIME": 7}) == 0.0


# --- smooth / smooth3 / delay_fixed parsing ---

def test_smooth_parses():
    parsed = parse_equation("smooth(x, 5)")
    assert parsed.symbols == {"x"}


def test_smooth3_parses():
    parsed = parse_equation("smooth3(x, 5)")
    assert parsed.symbols == {"x"}


def test_delay_fixed_parses():
    parsed = parse_equation("delay_fixed(x, 10, 0)")
    assert parsed.symbols == {"x"}
