from __future__ import annotations

import ast
import math
from dataclasses import dataclass, field
from typing import Mapping, Union

import numpy as np

from .parser import ParsedEquation, parse_equation

Scalar = Union[float, int]
ArrayLike = Union[float, np.ndarray]


@dataclass
class DimensionContext:
    """Maps dimension names to element lists, and variable names to their dimensions."""
    dimensions: dict[str, list[str]] = field(default_factory=dict)
    node_dimensions: dict[str, list[str]] = field(default_factory=dict)

    def element_index(self, variable: str, element: str) -> int:
        """Resolve an element name to its numeric index for a given variable."""
        dims = self.node_dimensions.get(variable, [])
        if not dims:
            raise KeyError(f"Variable '{variable}' has no dimensions")
        # For 1D: look up element in the first dimension
        dim_name = dims[0]
        elements = self.dimensions.get(dim_name, [])
        if element not in elements:
            raise KeyError(f"Element '{element}' not found in dimension '{dim_name}'")
        return elements.index(element)


SAFE_FUNCTIONS: dict[str, object] = {
    "min": np.minimum,
    "max": np.maximum,
    "abs": np.abs,
    "exp": np.exp,
    "log": np.log,
    "sin": np.sin,
    "cos": np.cos,
}


def _if_then_else(cond: float, a: float, b: float) -> float:
    return a if cond != 0.0 else b


# Context-aware functions: receive the evaluation context dict as first arg.
# The remaining args come from the equation call.

def _step(ctx: Mapping[str, ArrayLike], height: float, step_time: float) -> float:
    return height if ctx["TIME"] >= step_time else 0.0


def _ramp(ctx: Mapping[str, ArrayLike], slope: float, start: float, end: float = float("inf")) -> float:
    t = ctx["TIME"]
    if t < start:
        return 0.0
    if t > end:
        return slope * (end - start)
    return slope * (t - start)


def _pulse(ctx: Mapping[str, ArrayLike], height: float, start: float, width: float = 0.0) -> float:
    t = ctx["TIME"]
    if width <= 0.0:
        return height if t == start else 0.0
    return height if start <= t < start + width else 0.0


def _pulse_train(ctx: Mapping[str, ArrayLike], height: float, first: float, interval: float, last: float = float("inf")) -> float:
    t = ctx["TIME"]
    if t < first or t > last or interval <= 0:
        return 0.0
    elapsed = t - first
    remainder = elapsed % interval
    if remainder < 1e-10 or abs(remainder - interval) < 1e-10:
        return height
    return 0.0


CONTEXT_FUNCTIONS = {
    "step": _step,
    "ramp": _ramp,
    "pulse": _pulse,
    "pulse_train": _pulse_train,
}


class _Evaluator(ast.NodeVisitor):
    def __init__(self, context: Mapping[str, ArrayLike], dim_context: DimensionContext | None = None) -> None:
        self.context = context
        self.dim_context = dim_context or DimensionContext()

    def visit_Expression(self, node: ast.Expression) -> ArrayLike:
        return self.visit(node.body)

    def visit_Constant(self, node: ast.Constant) -> float:
        return float(node.value)

    def visit_Name(self, node: ast.Name) -> ArrayLike:
        if node.id not in self.context:
            raise KeyError(node.id)
        return self.context[node.id]

    def visit_Subscript(self, node: ast.Subscript) -> float:
        var_name = node.value.id
        element_name = node.slice.id
        value = self.context[var_name]
        if isinstance(value, np.ndarray):
            idx = self.dim_context.element_index(var_name, element_name)
            return float(value[idx])
        return float(value)  # scalar — subscript is no-op

    def visit_Compare(self, node: ast.Compare) -> ArrayLike:
        left = self.visit(node.left)
        for op, comparator in zip(node.ops, node.comparators):
            right = self.visit(comparator)
            if isinstance(op, ast.Gt):
                result = np.greater(left, right)
            elif isinstance(op, ast.GtE):
                result = np.greater_equal(left, right)
            elif isinstance(op, ast.Lt):
                result = np.less(left, right)
            elif isinstance(op, ast.LtE):
                result = np.less_equal(left, right)
            elif isinstance(op, ast.Eq):
                result = np.equal(left, right)
            elif isinstance(op, ast.NotEq):
                result = np.not_equal(left, right)
            else:
                raise TypeError(f"Unsupported comparison: {type(op).__name__}")
            if isinstance(result, np.ndarray):
                if not np.all(result):
                    return np.where(result, 1.0, 0.0)
                left = right
            else:
                if not result:
                    return 0.0
                left = right
        if isinstance(left, np.ndarray):
            return np.ones_like(left)
        return 1.0

    def visit_UnaryOp(self, node: ast.UnaryOp) -> ArrayLike:
        value = self.visit(node.operand)
        if isinstance(node.op, ast.USub):
            return -value
        if isinstance(node.op, ast.UAdd):
            return value
        raise TypeError(f"Unsupported unary op: {type(node.op).__name__}")

    def visit_BinOp(self, node: ast.BinOp) -> ArrayLike:
        left = self.visit(node.left)
        right = self.visit(node.right)
        if isinstance(node.op, ast.Add):
            return left + right
        if isinstance(node.op, ast.Sub):
            return left - right
        if isinstance(node.op, ast.Mult):
            return left * right
        if isinstance(node.op, ast.Div):
            return left / right
        if isinstance(node.op, ast.Pow):
            return left ** right
        raise TypeError(f"Unsupported binary op: {type(node.op).__name__}")

    def visit_Call(self, node: ast.Call) -> ArrayLike:
        func_name = node.func.id
        # if_then_else: use np.where for array support
        if func_name == "if_then_else":
            cond = self.visit(node.args[0])
            a = self.visit(node.args[1])
            b = self.visit(node.args[2])
            if isinstance(cond, np.ndarray) or isinstance(a, np.ndarray) or isinstance(b, np.ndarray):
                return np.where(np.asarray(cond) != 0.0, a, b)
            return a if cond != 0.0 else b
        # Aggregate functions
        if func_name == "SUM":
            val = self.visit(node.args[0])
            return float(np.sum(val))
        if func_name == "MEAN":
            val = self.visit(node.args[0])
            return float(np.mean(val))
        # Context-aware functions
        if func_name in CONTEXT_FUNCTIONS:
            args = [self.visit(arg) for arg in node.args]
            return CONTEXT_FUNCTIONS[func_name](self.context, *args)
        func = SAFE_FUNCTIONS[func_name]
        args = [self.visit(arg) for arg in node.args]
        return func(*args)

    def generic_visit(self, node: ast.AST) -> ArrayLike:  # pragma: no cover
        raise TypeError(f"Unexpected node: {type(node).__name__}")


def evaluate_expression(
    expression: str | ParsedEquation,
    context: Mapping[str, ArrayLike],
    dim_context: DimensionContext | None = None,
) -> ArrayLike:
    parsed = expression if isinstance(expression, ParsedEquation) else parse_equation(expression)
    return _Evaluator(context, dim_context).visit(parsed.tree)
