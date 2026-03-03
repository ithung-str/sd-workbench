from __future__ import annotations

import ast
import math
from typing import Mapping

from .parser import ParsedEquation, parse_equation

SAFE_FUNCTIONS = {
    "min": min,
    "max": max,
    "abs": abs,
    "exp": math.exp,
    "log": math.log,
}


def _if_then_else(cond: float, a: float, b: float) -> float:
    return a if cond != 0.0 else b


# Context-aware functions: receive the evaluation context dict as first arg.
# The remaining args come from the equation call.

def _step(ctx: Mapping[str, float], height: float, step_time: float) -> float:
    return height if ctx["TIME"] >= step_time else 0.0


def _ramp(ctx: Mapping[str, float], slope: float, start: float, end: float = float("inf")) -> float:
    t = ctx["TIME"]
    if t < start:
        return 0.0
    if t > end:
        return slope * (end - start)
    return slope * (t - start)


def _pulse(ctx: Mapping[str, float], height: float, start: float, width: float = 0.0) -> float:
    t = ctx["TIME"]
    if width <= 0.0:
        # Single-point pulse: active only at the exact start time step
        # In discrete simulation, match when TIME is within one dt of start
        return height if t == start else 0.0
    return height if start <= t < start + width else 0.0


def _pulse_train(ctx: Mapping[str, float], height: float, first: float, interval: float, last: float = float("inf")) -> float:
    t = ctx["TIME"]
    if t < first or t > last or interval <= 0:
        return 0.0
    # Check if we're at a pulse point (within floating point tolerance)
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
    def __init__(self, context: Mapping[str, float]) -> None:
        self.context = context

    def visit_Expression(self, node: ast.Expression) -> float:
        return self.visit(node.body)

    def visit_Constant(self, node: ast.Constant) -> float:
        return float(node.value)

    def visit_Name(self, node: ast.Name) -> float:
        if node.id not in self.context:
            raise KeyError(node.id)
        return float(self.context[node.id])

    def visit_Compare(self, node: ast.Compare) -> float:
        left = self.visit(node.left)
        for op, comparator in zip(node.ops, node.comparators):
            right = self.visit(comparator)
            if isinstance(op, ast.Gt):
                result = left > right
            elif isinstance(op, ast.GtE):
                result = left >= right
            elif isinstance(op, ast.Lt):
                result = left < right
            elif isinstance(op, ast.LtE):
                result = left <= right
            elif isinstance(op, ast.Eq):
                result = left == right
            elif isinstance(op, ast.NotEq):
                result = left != right
            else:
                raise TypeError(f"Unsupported comparison: {type(op).__name__}")
            if not result:
                return 0.0
            left = right
        return 1.0

    def visit_UnaryOp(self, node: ast.UnaryOp) -> float:
        value = self.visit(node.operand)
        if isinstance(node.op, ast.USub):
            return -value
        if isinstance(node.op, ast.UAdd):
            return value
        raise TypeError(f"Unsupported unary op: {type(node.op).__name__}")

    def visit_BinOp(self, node: ast.BinOp) -> float:
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

    def visit_Call(self, node: ast.Call) -> float:
        func_name = node.func.id
        # if_then_else: evaluate condition, then only the selected branch
        if func_name == "if_then_else":
            cond = self.visit(node.args[0])
            a = self.visit(node.args[1])
            b = self.visit(node.args[2])
            return _if_then_else(cond, a, b)
        # Context-aware functions (step, ramp, pulse, pulse_train)
        if func_name in CONTEXT_FUNCTIONS:
            args = [self.visit(arg) for arg in node.args]
            return float(CONTEXT_FUNCTIONS[func_name](self.context, *args))
        func = SAFE_FUNCTIONS[func_name]
        args = [self.visit(arg) for arg in node.args]
        return float(func(*args))

    def generic_visit(self, node: ast.AST) -> float:  # pragma: no cover
        raise TypeError(f"Unexpected node: {type(node).__name__}")



def evaluate_expression(expression: str | ParsedEquation, context: Mapping[str, float]) -> float:
    parsed = expression if isinstance(expression, ParsedEquation) else parse_equation(expression)
    return _Evaluator(context).visit(parsed.tree)
