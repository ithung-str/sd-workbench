from __future__ import annotations

import ast
from dataclasses import dataclass
from typing import Iterable

ALLOWED_FUNCTIONS = {"min", "max", "abs", "exp", "log"}
ALLOWED_BINOPS = (ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Pow)
ALLOWED_UNARYOPS = (ast.UAdd, ast.USub)
ALLOWED_NODE_TYPES = (
    ast.Expression,
    ast.BinOp,
    ast.UnaryOp,
    ast.Call,
    ast.Name,
    ast.Load,
    ast.Constant,
)


class EquationSyntaxError(ValueError):
    code = "INVALID_EQUATION_SYNTAX"


class UnsupportedExpressionError(ValueError):
    code = "UNSUPPORTED_EXPRESSION_FEATURE"


@dataclass(frozen=True)
class ParsedEquation:
    expression: str
    tree: ast.Expression
    symbols: set[str]


class _Validator(ast.NodeVisitor):
    def __init__(self) -> None:
        self.symbols: set[str] = set()

    def generic_visit(self, node: ast.AST) -> None:
        if not isinstance(node, ALLOWED_NODE_TYPES):
            raise UnsupportedExpressionError(f"Unsupported syntax: {type(node).__name__}")
        super().generic_visit(node)

    def visit_BinOp(self, node: ast.BinOp) -> None:
        if not isinstance(node.op, ALLOWED_BINOPS):
            raise UnsupportedExpressionError(f"Unsupported operator: {type(node.op).__name__}")
        self.visit(node.left)
        self.visit(node.right)

    def visit_UnaryOp(self, node: ast.UnaryOp) -> None:
        if not isinstance(node.op, ALLOWED_UNARYOPS):
            raise UnsupportedExpressionError(f"Unsupported unary operator: {type(node.op).__name__}")
        self.visit(node.operand)

    def visit_Call(self, node: ast.Call) -> None:
        if not isinstance(node.func, ast.Name):
            raise UnsupportedExpressionError("Only direct function names are allowed")
        if node.func.id not in ALLOWED_FUNCTIONS:
            raise UnsupportedExpressionError(f"Unsupported function: {node.func.id}")
        if node.keywords:
            raise UnsupportedExpressionError("Keyword arguments are not supported")
        for arg in node.args:
            self.visit(arg)

    def visit_Name(self, node: ast.Name) -> None:
        self.symbols.add(node.id)

    def visit_Constant(self, node: ast.Constant) -> None:
        if not isinstance(node.value, (int, float)):
            raise UnsupportedExpressionError("Only numeric literals are supported")



def parse_equation(expression: str) -> ParsedEquation:
    try:
        tree = ast.parse(expression, mode="eval")
    except SyntaxError as exc:
        raise EquationSyntaxError(str(exc)) from exc

    validator = _Validator()
    validator.visit(tree)
    return ParsedEquation(expression=expression, tree=tree, symbols=validator.symbols)



def extract_symbols(expression: str) -> set[str]:
    return parse_equation(expression).symbols
