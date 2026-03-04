# Native Subscript/Dimension Support — Design

## Goal

Add native array/subscript support to the SD Workbench so users can build models with subscripted variables (e.g., `Population[Region]`) directly in the UI. Variables with dimensions are evaluated as numpy arrays; the engine handles broadcasting, element-level indexing, and per-element equation overrides.

## Scope

**In scope (V1):**
- Model-level dimension definitions (`Region: North, South, East`)
- Assigning dimensions to Stock, Aux, Flow, and Lookup nodes
- Implicit-loop evaluation (one equation evaluates all elements via numpy)
- Explicit element access in equations (`Population[North]`)
- Per-element equation overrides (default equation + exceptions)
- Aggregate functions: `SUM(variable)`, `MEAN(variable)`
- Grouped-with-expansion result display in the frontend
- AI awareness of dimensions

**Out of scope (V1):**
- Subranges/sub-arrays (defining subsets of a dimension)
- Subscript mapping between dimensions
- EXCEPT clause syntax (covered by equation_overrides)
- Multi-dimensional initial value matrix editor
- Dimension-aware dashboard cards (follow-up)

## Approach: Array-Native

Variables stay as single nodes. The equation engine evaluates them as numpy arrays — one evaluation produces all elements simultaneously. Element-level overrides are stored as a map on the node. This keeps the model graph clean (one node = one concept) and leverages numpy broadcasting for mixed scalar/array math.

---

## 1. Schema

### Model-Level Dimensions

New `DimensionDefinition` schema and a `dimensions` list on `ModelDocument`.

**Backend (`model.py`):**

```python
class DimensionDefinition(BaseModel):
    id: str
    name: str
    elements: list[str]

    model_config = ConfigDict(extra="forbid")
```

```python
class ModelDocument(BaseModel):
    # ... existing fields ...
    dimensions: list[DimensionDefinition] = Field(default_factory=list)
```

**Frontend (`model.ts`):**

```typescript
type DimensionDefinition = {
  id: string;
  name: string;
  elements: string[];
};

type ModelDocument = {
  // ... existing fields ...
  dimensions: DimensionDefinition[];
};
```

### Subscripted Nodes

Stock, Aux, Flow, and Lookup nodes gain two optional fields:

```python
# Added to BaseNode
dimensions: list[str] = Field(default_factory=list)       # ["Region"]
equation_overrides: dict[str, str] = Field(default_factory=dict)  # {"North": "custom_eq"}
```

```typescript
// Added to StockNode, AuxNode, FlowNode, LookupNode
dimensions?: string[];
equation_overrides?: Record<string, string>;
```

When `dimensions` is empty, the node behaves exactly as today (scalar). When populated, the equation evaluates as an array across those dimensions.

For multi-dimensional variables: `dimensions: ["Region", "AgeGroup"]` creates a 2D array of shape `(len(Region), len(AgeGroup))`.

### Initial Values

For stocks with dimensions:
- Scalar `initial_value` (e.g., `100`) broadcasts to all elements: `np.full(shape, 100.0)`
- Expression `initial_value` evaluates in context (may produce array)

---

## 2. Equation Syntax

### Default Behavior (Implicit Loop)

When a node has `dimensions: ["Region"]`, the equation `birth_rate * Population` evaluates for all elements simultaneously via numpy broadcasting. If `birth_rate` is scalar and `Population` is shape (3,), the result is shape (3,).

### Explicit Element Access

Bracket syntax references specific elements:
- `Population[North]` — returns scalar value for North
- `Population[North] + Population[South]` — scalar arithmetic
- `SUM(Population)` — sum across all elements

### Per-Element Overrides

Stored in `equation_overrides` on the node. Default equation applies to all elements not in the map.

Example:
- Default equation: `birth_rate * Population`
- Override: `{"North": "northern_birth_rate * Population[North]"}`
- Result: South and East use the default; North uses the override

### New Aggregate Functions

- `SUM(variable)` — sum across all elements of a dimension, returns scalar
- `MEAN(variable)` — average across all elements, returns scalar

---

## 3. Parser Changes (`parser.py`)

- Add `ast.Subscript` to `ALLOWED_NODE_TYPES`
- Add `visit_Subscript()` handler to `_Validator`
- Symbol extraction: `Population[North]` extracts `Population` as the dependency (North is a dimension element, not a variable)
- Add `SUM`, `MEAN` to the allowed function list

---

## 4. Evaluator Changes (`evaluator.py`)

### Context Type Change

```python
# Before
context: Mapping[str, float]

# After
context: Mapping[str, float | np.ndarray]
```

Return type changes similarly: `float | np.ndarray`.

### New: DimensionContext

The evaluator receives a `DimensionContext` alongside the value context — maps dimension names to element lists. Used by `visit_Subscript` to resolve element names to array indices.

```python
@dataclass
class DimensionContext:
    dimensions: dict[str, list[str]]       # {"Region": ["North", "South", "East"]}
    node_dimensions: dict[str, list[str]]  # {"Population": ["Region"]}
```

### Evaluation Rules

| Node Type | Behavior |
|-----------|----------|
| `visit_Name` | Returns context value (float or ndarray) |
| `visit_Subscript` | Looks up array, indexes by element name → returns scalar |
| `visit_BinOp` | numpy broadcasting handles mixed scalar/array |
| `visit_Compare` | Returns float or ndarray of 0.0/1.0 |
| `visit_Call` (math) | `abs`, `exp`, `sin`, etc. work element-wise on ndarrays |
| `visit_Call` (SUM) | `np.sum(array)` → scalar |
| `visit_Call` (MEAN) | `np.mean(array)` → scalar |
| `if_then_else` | Uses `np.where(cond, a, b)` for array conditions |

---

## 5. Translator Changes (`translator.py`)

- `ExecutableModel` gains `dimension_context: DimensionContext`
- `translate_model()` builds the dimension context from `model.dimensions` and node dimension assignments
- Stock equation derivation (`_derive_stock_equations`) works unchanged — flow equations can be scalar or array; numpy handles the addition
- Delay expansion for array variables creates delay stocks of the same array shape
- Topological ordering works at the variable level (unchanged) — `Population` depends on `birth_rate`, regardless of dimension elements

---

## 6. Integrator Changes (`integrator.py`)

### State Storage

```python
stock_state: dict[str, float | np.ndarray]
```

Stocks with dimensions are initialized as ndarrays.

### Euler Step

```python
derivative = evaluate(stock.equation, context)  # returns ndarray
stock_state[name] = stock_state[name] + derivative * dt
```

Numpy handles element-wise addition. Clamping uses `np.clip`.

### Per-Element Overrides

After evaluating the default equation for all elements, overwrite specific indices:

```python
result = evaluate(default_equation, context)  # full array
for element_name, override_eq in node.equation_overrides.items():
    idx = dim_context.element_index(element_name)
    result[idx] = evaluate(override_eq, context)  # scalar
```

### Series Output

Array results are flattened into per-element series:

```python
series["Population[North]"].append(stock_state["Population"][0])
series["Population[South]"].append(stock_state["Population"][1])
series["Population[East]"].append(stock_state["Population"][2])
```

Multi-dimensional: `Variable[North,Young]`, `Variable[North,Old]`, etc.

### Delay Stocks

Delay stocks for array variables are also ndarrays. The delay arithmetic is element-wise.

---

## 7. Validation Additions

New checks in `semantic.py`:
- Each node's `dimensions` entries must reference a defined `DimensionDefinition.name`
- `equation_overrides` keys must be valid elements of the node's assigned dimensions
- Override equations must parse successfully and reference valid symbols
- Dimension compatibility: binary operations between subscripted variables must share dimensions or one must be scalar
- Subscript element names in equations must be valid elements of the correct dimension

---

## 8. Frontend — State and UI

### Editor Store (`editorStore.ts`)

New actions:
- `addDimension(name, elements)` — creates DimensionDefinition with generated id
- `updateDimension(id, patch)` — rename, add/remove elements
- `deleteDimension(id)` — removes dimension and strips it from any nodes that reference it
- `setNodeDimensions(nodeId, dimensions)` — assign dimensions to a node
- `setEquationOverride(nodeId, element, equation)` — set per-element override
- `removeEquationOverride(nodeId, element)` — remove override, revert to default

### Formulas Page

Collapsible "Dimensions" panel at the top of the Formulas page (above the variable table). Simple inline editing: dimension name + comma-separated elements. Add/delete buttons.

### Inspector Panel

When a Stock/Aux/Flow/Lookup is selected:
- **MultiSelect** for "Dimensions" — pick from model-defined dimensions
- When dimensions are assigned, expandable section shows **equation overrides** — one row per element with optional equation input. Empty = use default.

### Results Display (Grouped with Expansion)

Subscripted variables appear as collapsible groups in results:
- `▶ Population` — expands to:
  - `Population[North]`
  - `Population[South]`
  - `Population[East]`

The `outputs` list stores base variable names. Simulation returns flattened element-level series. Frontend groups them by detecting `Variable[Element]` pattern.

---

## 9. AI Integration

- Add `dimensions` and `equation_overrides` to `ALLOWED_FIELDS` for all variable types
- Add `dimensions` and `equation_overrides` to `PATCHABLE_FIELDS`
- Update system prompt: describe dimension definitions on ModelDocument, subscript syntax, SUM/MEAN functions
- AI can create subscripted models by including `dimensions` on nodes and `dimensions` on the model document

---

## 10. API Response Format

No structural change to the simulation response. `series: dict[str, list[float]]` already supports flattened `"Population[North]"` keys. The `variables_returned` metadata includes expanded element names.

---

## Files Summary

| Layer | File | Change |
|-------|------|--------|
| Backend schema | `schemas/model.py` | Add DimensionDefinition, dimensions/equation_overrides on BaseNode, dimensions on ModelDocument |
| Parser | `equations/parser.py` | Allow ast.Subscript, add SUM/MEAN, extract base variable names |
| Evaluator | `equations/evaluator.py` | Support float|ndarray context/return, add visit_Subscript, DimensionContext, np.where for if_then_else |
| Translator | `simulation/translator.py` | Build DimensionContext, pass to integrator |
| Integrator | `simulation/integrator.py` | ndarray state, element-wise Euler step, per-element overrides, flattened output |
| Validation | `validation/semantic.py` | Dimension existence, element validity, dimension compatibility checks |
| Frontend types | `types/model.ts` | Add DimensionDefinition, dimensions/equation_overrides on node types |
| Store | `state/editorStore.ts` | Dimension CRUD actions, node dimension actions, override actions |
| Formulas page | `components/formulas/FormulaPage.tsx` | Dimensions panel |
| Inspector | `components/inspector/InspectorPanelMantine.tsx` | Dimensions MultiSelect, overrides section |
| Results | `components/results/ResultsDockMantine.tsx` | Grouped collapsible display |
| AI service | `services/ai_model_service.py` | ALLOWED_FIELDS, PATCHABLE_FIELDS, system prompt |
| Tests | `tests/unit/` | Parser subscript tests, evaluator array tests, integrator array tests, validation dimension tests |
