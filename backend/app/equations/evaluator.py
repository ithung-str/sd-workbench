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
        func = SAFE_FUNCTIONS[node.func.id]
        args = [self.visit(arg) for arg in node.args]
        return float(func(*args))

    def generic_visit(self, node: ast.AST) -> float:  # pragma: no cover
        raise TypeError(f"Unexpected node: {type(node).__name__}")



def evaluate_expression(expression: str | ParsedEquation, context: Mapping[str, float]) -> float:
    parsed = expression if isinstance(expression, ParsedEquation) else parse_equation(expression)
    return _Evaluator(context).visit(parsed.tree)
