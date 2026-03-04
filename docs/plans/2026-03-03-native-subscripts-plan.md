# Native Subscript/Dimension Support — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add native array/subscript support so users can build models with subscripted variables (e.g., `Population[Region]`) — dimensions defined at the model level, numpy-backed evaluation, per-element overrides, and grouped result display.

**Architecture:** Model-level `DimensionDefinition` objects define available dimensions. Nodes gain optional `dimensions` and `equation_overrides` fields. The equation evaluator operates on `float | np.ndarray` values, using numpy broadcasting for mixed scalar/array math. The Euler integrator stores array state and flattens output to `"Variable[Element]"` series keys.

**Tech Stack:** Python (numpy, pydantic), TypeScript (React, Mantine, Zustand), existing equation parser (Python AST-based), existing Euler integrator.

---

## Task 1: Backend Schema — DimensionDefinition and Node Fields

**Files:**
- Modify: `backend/app/schemas/model.py:89-102` (BaseNode), `backend/app/schemas/model.py:374-383` (ModelDocument)
- Test: `backend/tests/unit/test_dimension_schema.py`

**Step 1: Write the failing test**

Create `backend/tests/unit/test_dimension_schema.py`:

```python
"""Tests for dimension-related schema additions."""
import pytest
from app.schemas.model import (
    DimensionDefinition,
    ModelDocument,
    StockNode,
    AuxNode,
    Position,
    SimConfig,
)


class TestDimensionDefinition:
    def test_basic_dimension(self):
        dim = DimensionDefinition(id="dim_1", name="Region", elements=["North", "South", "East"])
        assert dim.name == "Region"
        assert dim.elements == ["North", "South", "East"]

    def test_rejects_extra_fields(self):
        with pytest.raises(Exception):
            DimensionDefinition(id="dim_1", name="Region", elements=["N"], bogus="x")

    def test_empty_elements_allowed(self):
        dim = DimensionDefinition(id="dim_1", name="Empty", elements=[])
        assert dim.elements == []


class TestNodeDimensionFields:
    def test_stock_with_dimensions(self):
        node = StockNode(
            id="s1", type="stock", name="pop", label="Population",
            equation="inflow", initial_value=100,
            position=Position(x=0, y=0),
            dimensions=["Region"],
        )
        assert node.dimensions == ["Region"]
        assert node.equation_overrides == {}

    def test_stock_with_overrides(self):
        node = StockNode(
            id="s1", type="stock", name="pop", label="Population",
            equation="inflow", initial_value=100,
            position=Position(x=0, y=0),
            dimensions=["Region"],
            equation_overrides={"North": "special_inflow"},
        )
        assert node.equation_overrides == {"North": "special_inflow"}

    def test_aux_with_dimensions(self):
        node = AuxNode(
            id="a1", type="aux", name="rate", label="Rate",
            equation="0.1", position=Position(x=0, y=0),
            dimensions=["Region"],
        )
        assert node.dimensions == ["Region"]

    def test_scalar_node_has_empty_dimensions(self):
        node = AuxNode(
            id="a1", type="aux", name="rate", label="Rate",
            equation="0.1", position=Position(x=0, y=0),
        )
        assert node.dimensions == []
        assert node.equation_overrides == {}


class TestModelDocumentDimensions:
    def test_model_with_dimensions(self):
        doc = ModelDocument(
            id="m1", name="Test", version=1,
            dimensions=[
                DimensionDefinition(id="d1", name="Region", elements=["North", "South"]),
            ],
            nodes=[
                AuxNode(id="a1", type="aux", name="x", label="X",
                        equation="1", position=Position(x=0, y=0)),
            ],
        )
        assert len(doc.dimensions) == 1
        assert doc.dimensions[0].name == "Region"

    def test_model_without_dimensions(self):
        doc = ModelDocument(
            id="m1", name="Test", version=1,
            nodes=[
                AuxNode(id="a1", type="aux", name="x", label="X",
                        equation="1", position=Position(x=0, y=0)),
            ],
        )
        assert doc.dimensions == []
```

**Step 2: Run test to verify it fails**

Run: `.venv/bin/pytest backend/tests/unit/test_dimension_schema.py -v`
Expected: FAIL — `DimensionDefinition` does not exist, `dimensions` field not on BaseNode/ModelDocument

**Step 3: Implement the schema changes**

In `backend/app/schemas/model.py`, add before `BaseNode` (around line 88):

```python
class DimensionDefinition(BaseModel):
    id: str
    name: str
    elements: list[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")
```

In `BaseNode` (line 89), add after `source_id`:

```python
    dimensions: list[str] = Field(default_factory=list)
    equation_overrides: dict[str, str] = Field(default_factory=dict)
```

In `ModelDocument` (line 374), add after `outputs`:

```python
    dimensions: list[DimensionDefinition] = Field(default_factory=list)
```

**Step 4: Run test to verify it passes**

Run: `.venv/bin/pytest backend/tests/unit/test_dimension_schema.py -v`
Expected: PASS (all 8 tests)

**Step 5: Run full backend tests for regressions**

Run: `make test-backend`
Expected: PASS (except pre-existing failures in test_imports_api.py)

**Step 6: Commit**

```bash
git add backend/app/schemas/model.py backend/tests/unit/test_dimension_schema.py
git commit -m "feat: add DimensionDefinition schema and dimension fields on nodes"
```

---

## Task 2: Frontend Types — Mirror Schema Changes

**Files:**
- Modify: `frontend/src/types/model.ts:29-46` (StockNode), `frontend/src/types/model.ts:48-58` (AuxNode), `frontend/src/types/model.ts:60-76` (FlowNode), `frontend/src/types/model.ts:80-94` (LookupNode), `frontend/src/types/model.ts:154-170` (ModelDocument)

**Step 1: Add DimensionDefinition type and update node types**

In `frontend/src/types/model.ts`, add after the `LayoutMetadata` type (around line 27):

```typescript
export type DimensionDefinition = {
  id: string;
  name: string;
  elements: string[];
};
```

Add to `StockNode`, `AuxNode`, `FlowNode`, and `LookupNode`:

```typescript
  dimensions?: string[];
  equation_overrides?: Record<string, string>;
```

Add to `ModelDocument`:

```typescript
  dimensions: DimensionDefinition[];
```

**Step 2: Run frontend type check**

Run: `cd frontend && npx tsc -b 2>&1 | grep -c "error TS"`
Expected: Same error count as before (pre-existing errors only). Check no new errors referencing `dimensions` or `DimensionDefinition`.

**Step 3: Commit**

```bash
git add frontend/src/types/model.ts
git commit -m "feat: add DimensionDefinition type and dimension fields to frontend node types"
```

---

## Task 3: Parser — Allow Subscript Syntax and SUM/MEAN

**Files:**
- Modify: `backend/app/equations/parser.py:10-29` (ALLOWED_FUNCTIONS, ALLOWED_NODE_TYPES), `backend/app/equations/parser.py:47-91` (_Validator)
- Test: `backend/tests/unit/test_parser.py`

**Step 1: Write the failing tests**

Add to `backend/tests/unit/test_parser.py`:

```python
class TestSubscriptParsing:
    def test_simple_subscript(self):
        """Population[North] should parse, extracting 'Population' as symbol."""
        result = parse_equation("Population[North]")
        assert "Population" in result.symbols
        # 'North' is a dimension element, not a variable symbol
        assert "North" not in result.symbols

    def test_subscript_in_expression(self):
        """a[x] + b should extract both 'a' and 'b' as symbols."""
        result = parse_equation("a[x] + b")
        assert result.symbols == {"a", "b"}

    def test_subscript_with_arithmetic(self):
        """Population[North] + Population[South] should work."""
        result = parse_equation("Population[North] + Population[South]")
        assert result.symbols == {"Population"}

    def test_nested_subscript_rejected(self):
        """a[b[c]] should be rejected — only simple name subscripts allowed."""
        with pytest.raises((UnsupportedExpressionError, EquationSyntaxError)):
            parse_equation("a[b[c]]")

    def test_numeric_subscript_rejected(self):
        """a[0] should be rejected — subscripts must be names, not numbers."""
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
```

**Step 2: Run tests to verify they fail**

Run: `.venv/bin/pytest backend/tests/unit/test_parser.py::TestSubscriptParsing -v`
Expected: FAIL — `ast.Subscript` not in allowed types

**Step 3: Implement parser changes**

In `backend/app/equations/parser.py`:

1. Add `ast.Subscript` and `ast.Index` to `ALLOWED_NODE_TYPES` (line 20):

```python
ALLOWED_NODE_TYPES = (
    ast.Expression,
    ast.BinOp,
    ast.UnaryOp,
    ast.Compare,
    ast.Call,
    ast.Name,
    ast.Load,
    ast.Constant,
    ast.Subscript,
)
```

2. Add `"SUM"` and `"MEAN"` to `ALLOWED_FUNCTIONS` (line 10):

```python
ALLOWED_FUNCTIONS = (
    {"min", "max", "abs", "exp", "log", "sin", "cos", "if_then_else", "SUM", "MEAN"}
    | DELAY_FUNCTIONS
    | SMOOTH_FUNCTIONS
    | TIME_FUNCTIONS
    | {"delay_fixed"}
)
```

3. Add `visit_Subscript` method to `_Validator` (after `visit_Name` around line 85):

```python
    def visit_Subscript(self, node: ast.Subscript) -> None:
        # Only allow Variable[ElementName] — base must be a Name, slice must be a Name
        if not isinstance(node.value, ast.Name):
            raise UnsupportedExpressionError("Subscript base must be a variable name")
        slice_node = node.slice
        if not isinstance(slice_node, ast.Name):
            raise UnsupportedExpressionError("Subscript index must be a dimension element name")
        # Record the base variable as a symbol dependency (not the element name)
        self.symbols.add(node.value.id)
```

**Step 4: Run tests to verify they pass**

Run: `.venv/bin/pytest backend/tests/unit/test_parser.py -v`
Expected: PASS (all tests including new subscript tests)

**Step 5: Commit**

```bash
git add backend/app/equations/parser.py backend/tests/unit/test_parser.py
git commit -m "feat: parser accepts subscript syntax and SUM/MEAN functions"
```

---

## Task 4: Evaluator — Support ndarray Context and Subscript Indexing

**Files:**
- Modify: `backend/app/equations/evaluator.py` (entire file)
- Test: `backend/tests/unit/test_evaluator_arrays.py`

**Step 1: Write the failing tests**

Create `backend/tests/unit/test_evaluator_arrays.py`:

```python
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
```

**Step 2: Run tests to verify they fail**

Run: `.venv/bin/pytest backend/tests/unit/test_evaluator_arrays.py -v`
Expected: FAIL — `DimensionContext` doesn't exist, `evaluate_expression` doesn't accept it

**Step 3: Implement evaluator changes**

In `backend/app/equations/evaluator.py`:

1. Add imports and DimensionContext:

```python
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
```

2. Replace SAFE_FUNCTIONS with numpy-compatible versions:

```python
SAFE_FUNCTIONS: dict[str, object] = {
    "min": np.minimum,
    "max": np.maximum,
    "abs": np.abs,
    "exp": np.exp,
    "log": np.log,
    "sin": np.sin,
    "cos": np.cos,
}
```

3. Add aggregate functions:

```python
AGGREGATE_FUNCTIONS = {"SUM", "MEAN"}
```

4. Update `_Evaluator` to handle arrays:

```python
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
                # For chained comparisons with arrays, convert boolean array to 0.0/1.0
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
            return -value  # works for both float and ndarray
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

    def generic_visit(self, node: ast.AST) -> ArrayLike:
        raise TypeError(f"Unexpected node: {type(node).__name__}")
```

5. Update `evaluate_expression` signature:

```python
def evaluate_expression(
    expression: str | ParsedEquation,
    context: Mapping[str, ArrayLike],
    dim_context: DimensionContext | None = None,
) -> ArrayLike:
    parsed = expression if isinstance(expression, ParsedEquation) else parse_equation(expression)
    return _Evaluator(context, dim_context).visit(parsed.tree)
```

**Step 4: Run all tests**

Run: `.venv/bin/pytest backend/tests/unit/test_evaluator_arrays.py backend/tests/unit/test_parser.py -v`
Expected: PASS

Run: `make test-backend`
Expected: PASS — existing scalar tests still work because `float` is backwards compatible

**Step 5: Commit**

```bash
git add backend/app/equations/evaluator.py backend/tests/unit/test_evaluator_arrays.py
git commit -m "feat: evaluator supports ndarray context, subscript indexing, SUM/MEAN"
```

---

## Task 5: Translator — Build DimensionContext

**Files:**
- Modify: `backend/app/simulation/translator.py:38-48` (ExecutableModel), `backend/app/simulation/translator.py:290-355` (translate_model)
- Test: `backend/tests/unit/test_translator_dimensions.py`

**Step 1: Write the failing test**

Create `backend/tests/unit/test_translator_dimensions.py`:

```python
"""Tests for dimension-aware model translation."""
import pytest
from app.schemas.model import (
    AuxNode, DimensionDefinition, ModelDocument, Position, StockNode, FlowNode,
    FlowLinkEdge, InfluenceEdge,
)
from app.simulation.translator import translate_model


def _minimal_model_with_dims():
    return ModelDocument(
        id="m1", name="Test", version=1,
        dimensions=[
            DimensionDefinition(id="d1", name="Region", elements=["North", "South", "East"]),
        ],
        nodes=[
            StockNode(
                id="s1", type="stock", name="Population", label="Population",
                equation="inflow", initial_value=100,
                position=Position(x=0, y=0),
                dimensions=["Region"],
            ),
            AuxNode(
                id="a1", type="aux", name="inflow", label="Inflow",
                equation="0.1 * Population",
                position=Position(x=100, y=0),
                dimensions=["Region"],
            ),
        ],
        edges=[
            InfluenceEdge(id="e1", type="influence", source="a1", target="s1"),
        ],
        outputs=["Population"],
    )


class TestDimensionContext:
    def test_translate_builds_dimension_context(self):
        model = _minimal_model_with_dims()
        exe = translate_model(model)
        assert exe.dimension_context is not None
        assert "Region" in exe.dimension_context.dimensions
        assert exe.dimension_context.dimensions["Region"] == ["North", "South", "East"]

    def test_node_dimensions_populated(self):
        model = _minimal_model_with_dims()
        exe = translate_model(model)
        assert "Population" in exe.dimension_context.node_dimensions
        assert exe.dimension_context.node_dimensions["Population"] == ["Region"]
        assert "inflow" in exe.dimension_context.node_dimensions

    def test_scalar_model_has_empty_dimension_context(self):
        model = ModelDocument(
            id="m1", name="Test", version=1,
            nodes=[
                AuxNode(id="a1", type="aux", name="x", label="X",
                        equation="1", position=Position(x=0, y=0)),
            ],
            outputs=["x"],
        )
        exe = translate_model(model)
        assert exe.dimension_context.dimensions == {}
        assert exe.dimension_context.node_dimensions == {}
```

**Step 2: Run test to verify it fails**

Run: `.venv/bin/pytest backend/tests/unit/test_translator_dimensions.py -v`
Expected: FAIL — `dimension_context` not on ExecutableModel

**Step 3: Implement translator changes**

In `backend/app/simulation/translator.py`:

1. Import `DimensionContext`:

```python
from app.equations.evaluator import DimensionContext
```

2. Add `dimension_context` field to `ExecutableModel` (line 48):

```python
@dataclass(frozen=True)
class ExecutableModel:
    stock_nodes: list[StockNode]
    aux_nodes: list[AuxNode]
    flow_nodes: list[FlowNode]
    lookup_nodes: list[LookupNode]
    node_by_name: dict[str, object]
    transient_order: list[str]
    outputs: list[str]
    delay_stocks: list[DelayStock] = field(default_factory=list)
    delay_fixed_specs: list[DelayFixedSpec] = field(default_factory=list)
    dimension_context: DimensionContext = field(default_factory=DimensionContext)
```

3. In `translate_model()`, build the dimension context before returning:

```python
    # Build dimension context
    dim_dimensions: dict[str, list[str]] = {}
    dim_node_dims: dict[str, list[str]] = {}
    for dim_def in model.dimensions:
        dim_dimensions[dim_def.name] = list(dim_def.elements)
    for node in model.nodes:
        if hasattr(node, 'dimensions') and node.dimensions:
            dim_node_dims[node.name] = list(node.dimensions)
    dim_context = DimensionContext(dimensions=dim_dimensions, node_dimensions=dim_node_dims)
```

Pass `dimension_context=dim_context` to the `ExecutableModel(...)` constructor.

**Step 4: Run tests**

Run: `.venv/bin/pytest backend/tests/unit/test_translator_dimensions.py -v`
Expected: PASS

Run: `make test-backend`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/app/simulation/translator.py backend/tests/unit/test_translator_dimensions.py
git commit -m "feat: translator builds DimensionContext from model dimensions"
```

---

## Task 6: Integrator — Array State, Euler Step, Flattened Output

**Files:**
- Modify: `backend/app/simulation/integrator.py` (entire file)
- Test: `backend/tests/unit/test_integrator_arrays.py`

**Step 1: Write the failing test**

Create `backend/tests/unit/test_integrator_arrays.py`:

```python
"""Tests for array-aware Euler integration."""
import numpy as np
import pytest
from app.schemas.model import (
    AuxNode, DimensionDefinition, FlowNode, FlowLinkEdge, InfluenceEdge,
    ModelDocument, Position, StockNode,
)
from app.simulation.translator import translate_model
from app.simulation.integrator import simulate_euler


def _population_model():
    """Simple subscripted model: Population[Region] with constant inflow."""
    return ModelDocument(
        id="m1", name="Test", version=1,
        dimensions=[
            DimensionDefinition(id="d1", name="Region", elements=["North", "South"]),
        ],
        nodes=[
            StockNode(
                id="s1", type="stock", name="Population", label="Population",
                equation="growth", initial_value=100,
                position=Position(x=0, y=0),
                dimensions=["Region"],
            ),
            FlowNode(
                id="f1", type="flow", name="growth", label="Growth",
                equation="rate * Population",
                position=Position(x=100, y=0),
                dimensions=["Region"],
            ),
            AuxNode(
                id="a1", type="aux", name="rate", label="Rate",
                equation="0.1",
                position=Position(x=200, y=0),
            ),
        ],
        edges=[
            FlowLinkEdge(id="e1", type="flow_link", source="s1", target="f1"),
            InfluenceEdge(id="e2", type="influence", source="a1", target="f1"),
            InfluenceEdge(id="e3", type="influence", source="s1", target="f1"),
        ],
        outputs=["Population"],
    )


class TestArrayIntegration:
    def test_subscripted_output_keys(self):
        model = _population_model()
        exe = translate_model(model)
        series = simulate_euler(exe, start=0, stop=1, dt=0.5)
        assert "Population[North]" in series
        assert "Population[South]" in series
        assert "time" in series

    def test_subscripted_initial_values_broadcast(self):
        model = _population_model()
        exe = translate_model(model)
        series = simulate_euler(exe, start=0, stop=0, dt=1)
        # At t=0, both elements should be 100 (scalar broadcast)
        assert series["Population[North]"][0] == 100.0
        assert series["Population[South]"][0] == 100.0

    def test_subscripted_stocks_grow(self):
        model = _population_model()
        exe = translate_model(model)
        series = simulate_euler(exe, start=0, stop=2, dt=1)
        # Both regions start at 100, grow at 10% per step
        # t=0: 100, t=1: 100+10=110, t=2: 110+11=121
        assert series["Population[North]"][-1] == pytest.approx(121.0, rel=1e-6)
        assert series["Population[South]"][-1] == pytest.approx(121.0, rel=1e-6)

    def test_scalar_model_still_works(self):
        """Scalar models must not break."""
        model = ModelDocument(
            id="m1", name="Test", version=1,
            nodes=[
                StockNode(id="s1", type="stock", name="x", label="X",
                          equation="1", initial_value=0,
                          position=Position(x=0, y=0)),
            ],
            outputs=["x"],
        )
        exe = translate_model(model)
        series = simulate_euler(exe, start=0, stop=2, dt=1)
        assert series["x"] == [0.0, 1.0, 2.0]


class TestEquationOverrides:
    def test_per_element_override(self):
        model = ModelDocument(
            id="m1", name="Test", version=1,
            dimensions=[
                DimensionDefinition(id="d1", name="Region", elements=["North", "South"]),
            ],
            nodes=[
                StockNode(
                    id="s1", type="stock", name="Population", label="Population",
                    equation="growth", initial_value=100,
                    position=Position(x=0, y=0),
                    dimensions=["Region"],
                ),
                FlowNode(
                    id="f1", type="flow", name="growth", label="Growth",
                    equation="10",
                    position=Position(x=100, y=0),
                    dimensions=["Region"],
                    equation_overrides={"South": "20"},  # South grows faster
                ),
            ],
            edges=[
                FlowLinkEdge(id="e1", type="flow_link", source="s1", target="f1"),
            ],
            outputs=["Population"],
        )
        exe = translate_model(model)
        series = simulate_euler(exe, start=0, stop=1, dt=1)
        assert series["Population[North]"][-1] == 110.0  # 100 + 10
        assert series["Population[South]"][-1] == 120.0  # 100 + 20


class TestCrossElementReference:
    def test_reference_specific_element(self):
        """An equation can reference Population[North] explicitly."""
        model = ModelDocument(
            id="m1", name="Test", version=1,
            dimensions=[
                DimensionDefinition(id="d1", name="Region", elements=["North", "South"]),
            ],
            nodes=[
                AuxNode(
                    id="a1", type="aux", name="Population", label="Pop",
                    equation="100",
                    position=Position(x=0, y=0),
                    dimensions=["Region"],
                ),
                AuxNode(
                    id="a2", type="aux", name="north_pop", label="North Pop",
                    equation="Population[North]",
                    position=Position(x=100, y=0),
                ),
            ],
            edges=[
                InfluenceEdge(id="e1", type="influence", source="a1", target="a2"),
            ],
            outputs=["north_pop"],
        )
        exe = translate_model(model)
        series = simulate_euler(exe, start=0, stop=0, dt=1)
        assert series["north_pop"][0] == 100.0
```

**Step 2: Run tests to verify they fail**

Run: `.venv/bin/pytest backend/tests/unit/test_integrator_arrays.py -v`
Expected: FAIL — integrator doesn't handle ndarray state

**Step 3: Implement integrator changes**

Modify `backend/app/simulation/integrator.py`. The key changes:

1. Import numpy and DimensionContext:

```python
import numpy as np
from app.equations.evaluator import evaluate_expression, DimensionContext, ArrayLike
```

2. Change stock initialization to create arrays for dimensioned stocks:

```python
    dim_ctx = executable.dimension_context

    # initialize stocks
    stock_state: dict[str, ArrayLike] = {}
    for stock in executable.stock_nodes:
        initial = stock.initial_value
        if isinstance(initial, str):
            raw = evaluate_expression(initial, stock_state, dim_ctx)
        else:
            raw = float(initial)

        # If stock has dimensions, broadcast scalar to array
        if stock.dimensions:
            shape = tuple(
                len(dim_ctx.dimensions[d]) for d in stock.dimensions
            )
            if isinstance(raw, np.ndarray):
                stock_state[stock.name] = raw
            else:
                stock_state[stock.name] = np.full(shape, float(raw))
        else:
            stock_state[stock.name] = float(raw) if not isinstance(raw, np.ndarray) else float(raw)
```

3. Initialize series keys for array outputs (flattened):

```python
    # Initialize series keys
    for stock in executable.stock_nodes:
        if stock.dimensions:
            for combo in _element_combos(stock.dimensions, dim_ctx):
                series[f"{stock.name}[{combo}]"] = []
        else:
            series[stock.name] = []
```

Add helper:

```python
def _element_combos(dimensions: list[str], dim_ctx: DimensionContext) -> list[str]:
    """Generate element name combos: ['North', 'South'] for 1D, ['North,Young', ...] for multi-D."""
    if not dimensions:
        return []
    if len(dimensions) == 1:
        return dim_ctx.dimensions[dimensions[0]]
    # Multi-dimensional: cartesian product
    from itertools import product
    element_lists = [dim_ctx.dimensions[d] for d in dimensions]
    return [",".join(combo) for combo in product(*element_lists)]
```

4. Evaluate transients — pass `dim_ctx`, handle array results:

```python
        for name in executable.transient_order:
            node = executable.node_by_name[name]
            if isinstance(node, LookupNode):
                x_input = evaluate_expression(node.equation, context, dim_ctx)
                if isinstance(x_input, np.ndarray):
                    context[name] = np.array([_lookup_interpolate(node, float(v)) for v in x_input])
                else:
                    context[name] = _lookup_interpolate(node, float(x_input))
            else:
                result = evaluate_expression(node.equation, context, dim_ctx)
                # Apply per-element overrides
                if hasattr(node, 'equation_overrides') and node.equation_overrides and hasattr(node, 'dimensions') and node.dimensions:
                    if not isinstance(result, np.ndarray):
                        shape = tuple(len(dim_ctx.dimensions[d]) for d in node.dimensions)
                        result = np.full(shape, float(result))
                    for elem, override_eq in node.equation_overrides.items():
                        idx = dim_ctx.element_index(node.name, elem)
                        result[idx] = float(evaluate_expression(override_eq, context, dim_ctx))
                # Broadcast scalar to array if node has dimensions
                if hasattr(node, 'dimensions') and node.dimensions and not isinstance(result, np.ndarray):
                    shape = tuple(len(dim_ctx.dimensions[d]) for d in node.dimensions)
                    result = np.full(shape, float(result))
                context[name] = result
            # Clamp flows
            if isinstance(node, FlowNode):
                val = context[name]
                if node.non_negative:
                    context[name] = np.maximum(val, 0.0) if isinstance(val, np.ndarray) else max(val, 0.0)
                if node.min_value is not None:
                    context[name] = np.maximum(context[name], node.min_value) if isinstance(context[name], np.ndarray) else max(context[name], node.min_value)
                if node.max_value is not None:
                    context[name] = np.minimum(context[name], node.max_value) if isinstance(context[name], np.ndarray) else min(context[name], node.max_value)
            # Record transient series
            if hasattr(node, 'dimensions') and node.dimensions:
                combos = _element_combos(node.dimensions, dim_ctx)
                flat = np.ravel(context[name])
                for i, combo in enumerate(combos):
                    key = f"{name}[{combo}]"
                    if key not in series:
                        series[key] = []
                    series[key].append(float(flat[i]))
            else:
                series[name].append(float(context[name]))
```

5. Record stock values (flattened):

```python
        for stock in executable.stock_nodes:
            if stock.dimensions:
                combos = _element_combos(stock.dimensions, dim_ctx)
                flat = np.ravel(stock_state[stock.name])
                for i, combo in enumerate(combos):
                    series[f"{stock.name}[{combo}]"].append(float(flat[i]))
            else:
                series[stock.name].append(float(stock_state[stock.name]))
```

6. Advance stocks — handle array state:

```python
        next_stock_state: dict[str, ArrayLike] = {}
        for stock in executable.stock_nodes:
            derivative = evaluate_expression(stock.equation, context, dim_ctx)
            # Apply per-element overrides for stock equations
            if stock.equation_overrides and stock.dimensions:
                if not isinstance(derivative, np.ndarray):
                    shape = tuple(len(dim_ctx.dimensions[d]) for d in stock.dimensions)
                    derivative = np.full(shape, float(derivative))
                for elem, override_eq in stock.equation_overrides.items():
                    idx = dim_ctx.element_index(stock.name, elem)
                    derivative[idx] = float(evaluate_expression(override_eq, context, dim_ctx))
            current = stock_state[stock.name]
            if isinstance(current, np.ndarray):
                next_val = current + np.asarray(derivative) * dt
                if stock.non_negative:
                    next_val = np.maximum(next_val, 0.0)
                if stock.min_value is not None:
                    next_val = np.maximum(next_val, stock.min_value)
                if stock.max_value is not None:
                    next_val = np.minimum(next_val, stock.max_value)
                next_stock_state[stock.name] = next_val
            else:
                next_val = float(current) + float(derivative) * dt
                if stock.non_negative:
                    next_val = max(next_val, 0.0)
                if stock.min_value is not None:
                    next_val = max(next_val, stock.min_value)
                if stock.max_value is not None:
                    next_val = min(next_val, stock.max_value)
                next_stock_state[stock.name] = next_val
        stock_state = next_stock_state
```

7. Output filtering — match both base names and element names:

```python
    requested = set(executable.outputs)
    out_series = {"time": series["time"]}
    for key, values in series.items():
        if key == "time":
            continue
        # Match exact name OR base name of subscripted output (e.g., "Population" matches "Population[North]")
        base_name = key.split("[")[0] if "[" in key else key
        if key in requested or base_name in requested:
            out_series[key] = values
    return out_series
```

**Step 4: Run all tests**

Run: `.venv/bin/pytest backend/tests/unit/test_integrator_arrays.py -v`
Expected: PASS

Run: `make test-backend`
Expected: PASS — scalar models still work

**Step 5: Commit**

```bash
git add backend/app/simulation/integrator.py backend/tests/unit/test_integrator_arrays.py
git commit -m "feat: integrator supports array stocks, element overrides, flattened output"
```

---

## Task 7: Validation — Dimension Existence and Compatibility Checks

**Files:**
- Modify: `backend/app/validation/semantic.py:107-263`
- Test: `backend/tests/unit/test_validation_dimensions.py`

**Step 1: Write the failing test**

Create `backend/tests/unit/test_validation_dimensions.py`:

```python
"""Tests for dimension-related validation."""
import pytest
from app.schemas.model import (
    AuxNode, DimensionDefinition, ModelDocument, Position, StockNode,
)
from app.validation.semantic import validate_semantics


def _model(dimensions=None, nodes=None):
    return ModelDocument(
        id="m1", name="Test", version=1,
        dimensions=dimensions or [],
        nodes=nodes or [
            AuxNode(id="a1", type="aux", name="x", label="X",
                    equation="1", position=Position(x=0, y=0)),
        ],
        outputs=["x"],
    )


class TestDimensionValidation:
    def test_valid_dimension_reference(self):
        model = _model(
            dimensions=[DimensionDefinition(id="d1", name="Region", elements=["N", "S"])],
            nodes=[
                AuxNode(id="a1", type="aux", name="x", label="X",
                        equation="1", position=Position(x=0, y=0),
                        dimensions=["Region"]),
            ],
        )
        errors, _ = validate_semantics(model)
        dim_errors = [e for e in errors if e.code == "UNKNOWN_DIMENSION"]
        assert len(dim_errors) == 0

    def test_unknown_dimension_reference(self):
        model = _model(
            nodes=[
                AuxNode(id="a1", type="aux", name="x", label="X",
                        equation="1", position=Position(x=0, y=0),
                        dimensions=["Nonexistent"]),
            ],
        )
        errors, _ = validate_semantics(model)
        dim_errors = [e for e in errors if e.code == "UNKNOWN_DIMENSION"]
        assert len(dim_errors) == 1
        assert "Nonexistent" in dim_errors[0].message

    def test_invalid_override_element(self):
        model = _model(
            dimensions=[DimensionDefinition(id="d1", name="Region", elements=["N", "S"])],
            nodes=[
                AuxNode(id="a1", type="aux", name="x", label="X",
                        equation="1", position=Position(x=0, y=0),
                        dimensions=["Region"],
                        equation_overrides={"BadElement": "2"}),
            ],
        )
        errors, _ = validate_semantics(model)
        override_errors = [e for e in errors if e.code == "INVALID_OVERRIDE_ELEMENT"]
        assert len(override_errors) == 1

    def test_override_equation_must_parse(self):
        model = _model(
            dimensions=[DimensionDefinition(id="d1", name="Region", elements=["N", "S"])],
            nodes=[
                AuxNode(id="a1", type="aux", name="x", label="X",
                        equation="1", position=Position(x=0, y=0),
                        dimensions=["Region"],
                        equation_overrides={"N": "+++bad"}),
            ],
        )
        errors, _ = validate_semantics(model)
        syntax_errors = [e for e in errors if e.code == "INVALID_OVERRIDE_SYNTAX"]
        assert len(syntax_errors) == 1
```

**Step 2: Run test to verify it fails**

Run: `.venv/bin/pytest backend/tests/unit/test_validation_dimensions.py -v`
Expected: FAIL — no dimension validation logic exists

**Step 3: Implement validation**

In `backend/app/validation/semantic.py`, add dimension checks after the existing name/edge checks (around line 195, before equation parsing):

```python
    # ── Dimension validation ──
    defined_dim_names = {d.name for d in model.dimensions}
    dim_elements: dict[str, set[str]] = {
        d.name: set(d.elements) for d in model.dimensions
    }
    for node in variable_nodes:
        if not hasattr(node, 'dimensions'):
            continue
        for dim_name in node.dimensions:
            if dim_name not in defined_dim_names:
                errors.append(
                    ValidationIssue(
                        code="UNKNOWN_DIMENSION",
                        message=f"Node '{node.name}' references undefined dimension '{dim_name}'",
                        severity="error",
                        node_id=node.id,
                    )
                )
        if hasattr(node, 'equation_overrides'):
            all_elements = set()
            for dim_name in node.dimensions:
                all_elements |= dim_elements.get(dim_name, set())
            for elem, override_eq in node.equation_overrides.items():
                if elem not in all_elements:
                    errors.append(
                        ValidationIssue(
                            code="INVALID_OVERRIDE_ELEMENT",
                            message=f"Override element '{elem}' is not in dimensions of node '{node.name}'",
                            severity="error",
                            node_id=node.id,
                        )
                    )
                else:
                    try:
                        parse_equation(override_eq)
                    except (EquationSyntaxError, UnsupportedExpressionError) as exc:
                        errors.append(
                            ValidationIssue(
                                code="INVALID_OVERRIDE_SYNTAX",
                                message=f"Override equation for '{elem}' on '{node.name}': {exc}",
                                severity="error",
                                node_id=node.id,
                            )
                        )
```

**Step 4: Run tests**

Run: `.venv/bin/pytest backend/tests/unit/test_validation_dimensions.py -v`
Expected: PASS

Run: `make test-backend`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/app/validation/semantic.py backend/tests/unit/test_validation_dimensions.py
git commit -m "feat: validate dimension references and override elements"
```

---

## Task 8: AI Integration — ALLOWED_FIELDS, PATCHABLE_FIELDS, System Prompt

**Files:**
- Modify: `backend/app/services/ai_model_service.py:91-98` (ALLOWED_FIELDS), `backend/app/services/ai_model_service.py:319` (PATCHABLE_FIELDS), `backend/app/services/ai_model_service.py:322-449` (system prompt)
- Modify: `backend/tests/unit/test_ai_repair.py:573-575` (PATCHABLE_FIELDS test)

**Step 1: Update ALLOWED_FIELDS**

In `ALLOWED_FIELDS`, add `"dimensions"` and `"equation_overrides"` to stock, flow, aux, and lookup:

```python
_BASE_VARIABLE_FIELDS = {"id", "type", "name", "label", "equation", "units", "position", "style", "layout", "annotation", "source_id", "dimensions", "equation_overrides"}
```

**Step 2: Update PATCHABLE_FIELDS**

```python
PATCHABLE_FIELDS = {"equation", "initial_value", "units", "label", "name", "non_negative", "min_value", "max_value", "longitude", "latitude", "dimensions", "equation_overrides"}
```

**Step 3: Update system prompt**

In the `_system_instructions()` function, add after the stock node description (around line 423):

```python
        "Dimensions: Define dimensions on the model document, then reference them on nodes.\n"
        "  Model-level: {\"dimensions\": [{\"id\": \"dim_1\", \"name\": \"Region\", \"elements\": [\"North\", \"South\"]}]}\n"
        "  Node-level: {\"dimensions\": [\"Region\"]} on any stock/aux/flow/lookup node.\n"
        "  Per-element overrides: {\"equation_overrides\": {\"North\": \"custom_equation\"}}\n"
        "  Subscript access in equations: Population[North] references a specific element.\n"
        "  Aggregate functions: SUM(variable), MEAN(variable) — sum/average across all elements.\n"
        "\n"
```

Add `"dimensions"` and `"equation_overrides"` to the patchable fields documentation string:

```python
        "   Patchable fields: equation, initial_value, units, label, name, non_negative, min_value, max_value, longitude, latitude, dimensions, equation_overrides.\n"
```

**Step 4: Update PATCHABLE_FIELDS test**

In `backend/tests/unit/test_ai_repair.py`, update the assertion:

```python
        assert PATCHABLE_FIELDS == {"equation", "initial_value", "units", "label", "name", "non_negative", "min_value", "max_value", "longitude", "latitude", "dimensions", "equation_overrides"}
```

**Step 5: Run tests**

Run: `make test-backend`
Expected: PASS

**Step 6: Commit**

```bash
git add backend/app/services/ai_model_service.py backend/tests/unit/test_ai_repair.py
git commit -m "feat: AI integration for dimensions — ALLOWED_FIELDS, PATCHABLE_FIELDS, system prompt"
```

---

## Task 9: Editor Store — Dimension CRUD and Node Dimension Actions

**Files:**
- Modify: `frontend/src/state/editorStore.ts`
- Test: `frontend/src/state/editorStore.test.ts`

**Step 1: Add dimension actions to the store**

In `editorStore.ts`, add to the state type (around the action method signatures section):

```typescript
  // Dimension management
  addDimension: (name: string, elements: string[]) => void;
  updateDimension: (id: string, patch: Partial<Pick<DimensionDefinition, 'name' | 'elements'>>) => void;
  deleteDimension: (id: string) => void;
```

Implement the actions in the store `create` body:

```typescript
addDimension: (name, elements) => {
  const before = snapshotFromState(get().model, get().selected);
  set((state) => {
    const id = `dim_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const dim: DimensionDefinition = { id, name, elements };
    const dimensions = [...(state.model.dimensions ?? []), dim];
    const model = { ...state.model, dimensions };
    return { model };
  });
  const afterState = get();
  scheduleGroupedCommit('dimension:add', before, snapshotFromState(afterState.model, afterState.selected));
},

updateDimension: (id, patch) => {
  const before = snapshotFromState(get().model, get().selected);
  set((state) => {
    const dimensions = (state.model.dimensions ?? []).map((d) =>
      d.id === id ? { ...d, ...patch } : d
    );
    const model = { ...state.model, dimensions };
    return { model };
  });
  const afterState = get();
  scheduleGroupedCommit(`dimension:${id}`, before, snapshotFromState(afterState.model, afterState.selected));
},

deleteDimension: (id) => {
  const before = snapshotFromState(get().model, get().selected);
  set((state) => {
    const deletedDim = (state.model.dimensions ?? []).find((d) => d.id === id);
    const dimensions = (state.model.dimensions ?? []).filter((d) => d.id !== id);
    // Strip this dimension from any nodes that reference it
    let nodes = state.model.nodes;
    if (deletedDim) {
      nodes = nodes.map((n) => {
        if ('dimensions' in n && n.dimensions?.includes(deletedDim.name)) {
          return {
            ...n,
            dimensions: n.dimensions.filter((d: string) => d !== deletedDim.name),
            equation_overrides: {},  // clear overrides since dimension is gone
          } as typeof n;
        }
        return n;
      });
    }
    const model = { ...state.model, dimensions, nodes };
    return { model };
  });
  const afterState = get();
  scheduleGroupedCommit('dimension:delete', before, snapshotFromState(afterState.model, afterState.selected));
},
```

**Step 2: Write tests**

Add to `frontend/src/state/editorStore.test.ts`:

```typescript
describe('Dimension management', () => {
  it('addDimension creates a new dimension', () => {
    const { result } = renderHook(() => useEditorStore());
    act(() => result.current.addDimension('Region', ['North', 'South']));
    const dims = result.current.model.dimensions ?? [];
    expect(dims).toHaveLength(1);
    expect(dims[0].name).toBe('Region');
    expect(dims[0].elements).toEqual(['North', 'South']);
  });

  it('updateDimension renames a dimension', () => {
    const { result } = renderHook(() => useEditorStore());
    act(() => result.current.addDimension('Region', ['N', 'S']));
    const dimId = (result.current.model.dimensions ?? [])[0].id;
    act(() => result.current.updateDimension(dimId, { name: 'Area' }));
    expect((result.current.model.dimensions ?? [])[0].name).toBe('Area');
  });

  it('deleteDimension removes dimension and strips from nodes', () => {
    const { result } = renderHook(() => useEditorStore());
    act(() => result.current.addDimension('Region', ['N', 'S']));
    const dimId = (result.current.model.dimensions ?? [])[0].id;
    // Assign dimension to a node
    const nodeId = result.current.model.nodes[0]?.id;
    if (nodeId) {
      act(() => result.current.updateNode(nodeId, { dimensions: ['Region'] }));
    }
    act(() => result.current.deleteDimension(dimId));
    expect(result.current.model.dimensions ?? []).toHaveLength(0);
  });
});
```

**Step 3: Run tests**

Run: `make test-frontend`
Expected: PASS

**Step 4: Commit**

```bash
git add frontend/src/state/editorStore.ts frontend/src/state/editorStore.test.ts
git commit -m "feat: editor store dimension CRUD actions"
```

---

## Task 10: Formulas Page — Dimensions Panel

**Files:**
- Modify: `frontend/src/components/formulas/FormulaPage.tsx`

**Step 1: Add a Dimensions management section**

At the top of the FormulaPage, above the variable table, add a collapsible "Dimensions" panel:

```tsx
import { ActionIcon, Button, Collapse, Group, Stack, Table, Text, TextInput } from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';

// Inside FormulaPage component, before the variable table:
const [dimOpen, setDimOpen] = useState(true);
const dimensions = model.dimensions ?? [];
const addDimension = useEditorStore((s) => s.addDimension);
const updateDimension = useEditorStore((s) => s.updateDimension);
const deleteDimension = useEditorStore((s) => s.deleteDimension);

// State for new dimension form
const [newDimName, setNewDimName] = useState('');
const [newDimElements, setNewDimElements] = useState('');

// Render:
<Stack gap="xs" mb="md">
  <Group justify="space-between">
    <Text fw={600} size="sm" onClick={() => setDimOpen((o) => !o)} style={{ cursor: 'pointer' }}>
      {dimOpen ? '▼' : '▶'} Dimensions ({dimensions.length})
    </Text>
  </Group>
  <Collapse in={dimOpen}>
    <Stack gap={4}>
      {dimensions.map((dim) => (
        <Group key={dim.id} gap="xs">
          <TextInput
            size="xs" style={{ flex: 1 }} placeholder="Name"
            value={dim.name}
            onChange={(e) => updateDimension(dim.id, { name: e.currentTarget.value })}
          />
          <TextInput
            size="xs" style={{ flex: 2 }} placeholder="Elements (comma-separated)"
            value={dim.elements.join(', ')}
            onChange={(e) => updateDimension(dim.id, {
              elements: e.currentTarget.value.split(',').map((s) => s.trim()).filter(Boolean),
            })}
          />
          <ActionIcon size="sm" color="red" variant="subtle" onClick={() => deleteDimension(dim.id)}>
            <IconTrash size={14} />
          </ActionIcon>
        </Group>
      ))}
      <Group gap="xs">
        <TextInput size="xs" placeholder="New dimension name" value={newDimName}
          onChange={(e) => setNewDimName(e.currentTarget.value)} style={{ flex: 1 }} />
        <TextInput size="xs" placeholder="Elements (comma-separated)" value={newDimElements}
          onChange={(e) => setNewDimElements(e.currentTarget.value)} style={{ flex: 2 }} />
        <ActionIcon size="sm" variant="light"
          onClick={() => {
            if (newDimName.trim()) {
              addDimension(newDimName.trim(), newDimElements.split(',').map((s) => s.trim()).filter(Boolean));
              setNewDimName('');
              setNewDimElements('');
            }
          }}>
          <IconPlus size={14} />
        </ActionIcon>
      </Group>
    </Stack>
  </Collapse>
</Stack>
```

**Step 2: Run type check and frontend tests**

Run: `cd frontend && npx tsc -b`
Run: `make test-frontend`
Expected: PASS (no new errors)

**Step 3: Commit**

```bash
git add frontend/src/components/formulas/FormulaPage.tsx
git commit -m "feat: dimensions management panel on Formulas page"
```

---

## Task 11: Inspector Panel — Dimension MultiSelect and Overrides

**Files:**
- Modify: `frontend/src/components/inspector/InspectorPanelMantine.tsx`

**Step 1: Add dimensions UI to the inspector**

After the longitude/latitude fields in the stock section (and in the aux/flow/lookup sections), add:

```tsx
// Get available dimensions
const availableDimensions = (model.dimensions ?? []).map((d) => d.name);

// Inside the stock/aux/flow/lookup blocks:
{availableDimensions.length > 0 && (
  <MultiSelect
    label="Dimensions"
    size="xs"
    placeholder="None"
    data={availableDimensions}
    value={node.dimensions ?? []}
    onChange={(dims) => updateNode(node.id, { dimensions: dims } as Partial<NodeModel>)}
  />
)}

{(node.dimensions?.length ?? 0) > 0 && (
  <Stack gap={2}>
    <Text size="xs" fw={500}>Equation Overrides</Text>
    {(model.dimensions ?? [])
      .filter((d) => node.dimensions?.includes(d.name))
      .flatMap((d) => d.elements)
      .map((elem) => (
        <Group key={elem} gap={4}>
          <Text size="xs" w={80} c="dimmed">{elem}:</Text>
          <TextInput
            size="xs"
            style={{ flex: 1 }}
            placeholder="(use default equation)"
            value={node.equation_overrides?.[elem] ?? ''}
            onChange={(e) => {
              const overrides = { ...(node.equation_overrides ?? {}) };
              if (e.currentTarget.value) {
                overrides[elem] = e.currentTarget.value;
              } else {
                delete overrides[elem];
              }
              updateNode(node.id, { equation_overrides: overrides } as Partial<NodeModel>);
            }}
          />
        </Group>
      ))}
  </Stack>
)}
```

This needs to be added inside each node type block where it makes sense (stock, aux, flow). The `model` reference should come from the store: `const model = useEditorStore((s) => s.model)`.

**Step 2: Run type check**

Run: `cd frontend && npx tsc -b`
Expected: Same pre-existing errors only

**Step 3: Commit**

```bash
git add frontend/src/components/inspector/InspectorPanelMantine.tsx
git commit -m "feat: inspector shows dimension MultiSelect and equation overrides"
```

---

## Task 12: Results Display — Grouped with Expansion

**Files:**
- Modify: `frontend/src/components/results/ResultsChart.tsx`

**Step 1: Implement grouped variable display**

In `ResultsChart.tsx`, modify the variable list to group subscripted variables:

```typescript
// Group variables: "Population[North]", "Population[South]" → group under "Population"
const groupedKeys = useMemo(() => {
  const groups: Record<string, string[]> = {};
  const scalars: string[] = [];
  for (const key of keys) {
    const match = key.match(/^(.+)\[(.+)\]$/);
    if (match) {
      const base = match[1];
      if (!groups[base]) groups[base] = [];
      groups[base].push(key);
    } else {
      scalars.push(key);
    }
  }
  return { groups, scalars };
}, [keys]);
```

For the variable Select, render grouped options:

```typescript
const selectData = useMemo(() => {
  const items: Array<{ group?: string; value: string; label: string }> = [];
  for (const scalar of groupedKeys.scalars) {
    items.push({ value: scalar, label: scalar });
  }
  for (const [group, members] of Object.entries(groupedKeys.groups)) {
    for (const member of members) {
      items.push({ group, value: member, label: member });
    }
  }
  return items;
}, [groupedKeys]);
```

Use `<Select data={selectData} ...>` — Mantine's Select supports the `group` property for grouped dropdowns.

**Step 2: Run type check and tests**

Run: `cd frontend && npx tsc -b`
Run: `make test-frontend`
Expected: PASS

**Step 3: Commit**

```bash
git add frontend/src/components/results/ResultsChart.tsx
git commit -m "feat: results chart groups subscripted variables by base name"
```

---

## Task 13: Final Verification

**Step 1: Run all backend tests**

Run: `make test-backend`
Expected: PASS (except pre-existing failures in test_imports_api.py)

**Step 2: Run all frontend tests**

Run: `make test-frontend`
Expected: PASS (all tests)

**Step 3: Run type check**

Run: `cd frontend && npx tsc -b`
Expected: Same pre-existing errors only, no new errors

**Step 4: Commit any remaining changes**

```bash
git add -A
git commit -m "chore: final cleanup for native subscript support"
```

---

## Summary of Files Changed

| File | Change |
|------|--------|
| `backend/app/schemas/model.py` | Add DimensionDefinition, dimensions/equation_overrides on BaseNode, dimensions on ModelDocument |
| `backend/app/equations/parser.py` | Allow ast.Subscript, add SUM/MEAN, visit_Subscript handler |
| `backend/app/equations/evaluator.py` | DimensionContext, ndarray support, visit_Subscript, SUM/MEAN, np.where for if_then_else |
| `backend/app/simulation/translator.py` | dimension_context field on ExecutableModel, build DimensionContext in translate_model |
| `backend/app/simulation/integrator.py` | Array state, element overrides, flattened output, array-aware Euler step |
| `backend/app/validation/semantic.py` | Dimension existence, override element, override syntax checks |
| `backend/app/services/ai_model_service.py` | ALLOWED_FIELDS, PATCHABLE_FIELDS, system prompt |
| `frontend/src/types/model.ts` | DimensionDefinition type, dimension fields on node types |
| `frontend/src/state/editorStore.ts` | addDimension, updateDimension, deleteDimension actions |
| `frontend/src/components/formulas/FormulaPage.tsx` | Dimensions management panel |
| `frontend/src/components/inspector/InspectorPanelMantine.tsx` | Dimension MultiSelect, equation overrides UI |
| `frontend/src/components/results/ResultsChart.tsx` | Grouped variable display |
| `backend/tests/unit/test_dimension_schema.py` | Schema tests |
| `backend/tests/unit/test_evaluator_arrays.py` | Array evaluator tests |
| `backend/tests/unit/test_translator_dimensions.py` | Translator dimension tests |
| `backend/tests/unit/test_integrator_arrays.py` | Array integration tests |
| `backend/tests/unit/test_validation_dimensions.py` | Dimension validation tests |
| `backend/tests/unit/test_ai_repair.py` | Update PATCHABLE_FIELDS assertion |
| `frontend/src/state/editorStore.test.ts` | Dimension CRUD tests |
