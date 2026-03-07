"""
Subprocess runner for analysis nodes.
Reads JSON manifest from stdin: { "inputs": { "df_in": <parquet_b64>, ... }, "code": "..." }
Executes code, writes JSON result to stdout.

Output detection priority:
  1. ``df_out`` (DataFrame) — backward compatible
  2. ``result`` — any JSON-serializable value (scalar, dict, list, str)
  3. ``df`` — modified input DataFrame fallback
  4. Last expression value (notebook-style auto-display)
  5. Error if none is set
"""
import ast
import base64
import importlib
import io
import json
import sys
import traceback


# ---------------------------------------------------------------------------
# Optional package registry
# Each entry: (import_path, namespace_alias)
#   e.g. ("scipy.stats", "stats") → `from scipy import stats` exposed as `stats`
#   e.g. ("sklearn", None)        → `import sklearn` exposed as `sklearn`
# ---------------------------------------------------------------------------
OPTIONAL_PACKAGES: list[tuple[str, str | None]] = [
    ("scipy.stats", "stats"),
    ("sklearn", None),
    ("sklearn.preprocessing", None),
    ("sklearn.linear_model", None),
    ("sklearn.cluster", None),
    ("statsmodels.api", "sm"),
    ("statsmodels.formula.api", "smf"),
]


# ---------------------------------------------------------------------------
# sdw_checks — make available as `from sdw_checks import ...` in user code
# ---------------------------------------------------------------------------
def _register_checks_module() -> None:
    """Register the checks module so user code can ``from sdw_checks import ...``."""
    import pathlib
    checks_path = pathlib.Path(__file__).with_name("checks.py")
    if not checks_path.exists():
        return
    import importlib.util
    spec = importlib.util.spec_from_file_location("sdw_checks", str(checks_path))
    if spec and spec.loader:
        mod = importlib.util.module_from_spec(spec)
        sys.modules["sdw_checks"] = mod
        spec.loader.exec_module(mod)


def _try_import(import_path: str, alias: str | None) -> tuple[str, object] | None:
    """Attempt to import a module. Returns (namespace_name, module) or None."""
    try:
        parts = import_path.rsplit(".", 1)
        if len(parts) == 2:
            parent = importlib.import_module(parts[0])
            mod = getattr(parent, parts[1], None)
            if mod is None:
                mod = importlib.import_module(import_path)
        else:
            mod = importlib.import_module(import_path)
        name = alias if alias else parts[-1]
        return (name, mod)
    except (ImportError, AttributeError):
        return None


def _make_serializable(val: object) -> object:
    """Recursively convert numpy/pandas types to plain Python for JSON."""
    import numpy as np
    import pandas as pd

    if isinstance(val, (np.integer,)):
        return int(val)
    if isinstance(val, (np.floating,)):
        return float(val)
    if isinstance(val, np.ndarray):
        return val.tolist()
    if isinstance(val, pd.Series):
        return val.tolist()
    if isinstance(val, dict):
        return {k: _make_serializable(v) for k, v in val.items()}
    if isinstance(val, (list, tuple)):
        return [_make_serializable(v) for v in val]
    return val


def _format_display(val: object) -> str | None:
    """Produce a human-readable text representation of a value for cell output."""
    import numpy as np
    import pandas as pd

    if val is None:
        return None
    if isinstance(val, pd.DataFrame):
        return val.to_string(max_rows=20, max_cols=20)
    if isinstance(val, pd.Series):
        return val.to_string(max_rows=30)
    if isinstance(val, np.ndarray):
        return repr(val)
    if isinstance(val, dict):
        try:
            return json.dumps(_make_serializable(val), indent=2, ensure_ascii=False)
        except (TypeError, ValueError):
            return repr(val)
    if isinstance(val, (list, tuple)):
        try:
            serializable = _make_serializable(val)
            text = json.dumps(serializable, indent=2, ensure_ascii=False)
            # Truncate very long lists
            if len(text) > 3000:
                return text[:3000] + f"\n... ({len(val)} items total)"
            return text
        except (TypeError, ValueError):
            return repr(val)
    if isinstance(val, str):
        return val
    return repr(val)


def _exec_with_last_expr(code: str, namespace: dict) -> object | None:
    """Execute code and return the value of the last expression, if any.

    Like Jupyter/IPython: if the last statement is an expression (not an
    assignment, import, etc.), evaluate it separately and return its value.
    """
    try:
        tree = ast.parse(code)
    except SyntaxError:
        # Fall back to plain exec; syntax error will surface there
        exec(code, namespace)  # noqa: S102
        return None

    if not tree.body:
        return None

    last_stmt = tree.body[-1]

    # Only auto-display if the last statement is a bare expression
    if not isinstance(last_stmt, ast.Expr):
        exec(code, namespace)  # noqa: S102
        return None

    # Execute everything except the last statement
    if len(tree.body) > 1:
        mod = ast.Module(body=tree.body[:-1], type_ignores=[])
        exec(compile(mod, "<node>", "exec"), namespace)  # noqa: S102

    # Evaluate the last expression and return its value
    expr = ast.Expression(body=last_stmt.value)
    return eval(compile(expr, "<node>", "eval"), namespace)  # noqa: S307


def main() -> None:
    try:
        import numpy as np
        import pandas as pd

        _register_checks_module()

        manifest = json.loads(sys.stdin.read())
        code = manifest["code"]
        input_data = manifest.get("inputs", {})

        # Build namespace with core packages
        namespace: dict = {"pd": pd, "np": np}

        # Load optional packages into namespace
        for import_path, alias in OPTIONAL_PACKAGES:
            result = _try_import(import_path, alias)
            if result:
                namespace[result[0]] = result[1]

        # Deserialize input DataFrames
        for name, b64 in input_data.items():
            buf = io.BytesIO(base64.b64decode(b64))
            namespace[name] = pd.read_parquet(buf)

        # Convenience alias: if single input is df_in, also expose as df
        if list(input_data.keys()) == ["df_in"]:
            namespace["df"] = namespace["df_in"]

        # Parse code and split last expression for notebook-style auto-display
        last_expr_value = _exec_with_last_expr(code, namespace)

        # Build display text from last expression (shown inline in cell)
        display_text = _format_display(last_expr_value) if last_expr_value is not None else None

        def _emit_df(df: pd.DataFrame) -> None:
            buf = io.BytesIO()
            df.to_parquet(buf, index=False)
            b64_out = base64.b64encode(buf.getvalue()).decode()
            out: dict = {"ok": True, "kind": "dataframe", "output": b64_out}
            if display_text is not None:
                out["display"] = display_text
            json.dump(out, sys.stdout)

        def _emit_generic(val: object) -> None:
            if isinstance(val, dict):
                kind = "dict"
            elif isinstance(val, (list, tuple)):
                kind = "list"
            elif isinstance(val, str) and len(val) > 100:
                kind = "text"
            else:
                kind = "scalar"
            out: dict = {
                "ok": True,
                "kind": kind,
                "generic_output": _make_serializable(val),
            }
            if display_text is not None:
                out["display"] = display_text
            json.dump(out, sys.stdout)

        # 1) Prefer df_out (DataFrame or dict-convertible) — backward compatible
        output_df = namespace.get("df_out")
        if output_df is not None and isinstance(output_df, dict):
            output_df = pd.DataFrame(output_df)
        if output_df is not None and isinstance(output_df, pd.DataFrame):
            _emit_df(output_df)
            return

        # 2) Fallback: detect `result` variable for generic outputs
        result_val = namespace.get("result")
        if result_val is not None:
            if isinstance(result_val, pd.DataFrame):
                _emit_df(result_val)
                return
            _emit_generic(result_val)
            return

        # 3) Fallback: check if a variable named 'df' is a DataFrame
        df_var = namespace.get("df")
        if df_var is not None and isinstance(df_var, pd.DataFrame):
            _emit_df(df_var)
            return

        # 4) Notebook-style: use last expression value if available
        if last_expr_value is not None:
            if isinstance(last_expr_value, pd.DataFrame):
                # No separate display needed — the expr IS the pipeline output
                buf = io.BytesIO()
                last_expr_value.to_parquet(buf, index=False)
                b64_out = base64.b64encode(buf.getvalue()).decode()
                json.dump({"ok": True, "kind": "dataframe", "output": b64_out}, sys.stdout)
                return
            _emit_generic(last_expr_value)
            return

        # 5) None of the output conventions matched
        json.dump({
            "ok": False,
            "error": "Code must assign result to `df_out` (DataFrame), `result` (any value), or `df` (DataFrame), or end with an expression",
        }, sys.stdout)

    except Exception as exc:
        # Surface CheckError with a clean message (no traceback noise)
        sdw_mod = sys.modules.get("sdw_checks")
        check_err = getattr(sdw_mod, "CheckError", None) if sdw_mod else None
        if check_err and isinstance(exc, check_err):
            json.dump({"ok": False, "error": f"Validation failed: {exc}"}, sys.stdout)
        else:
            json.dump({"ok": False, "error": traceback.format_exc()}, sys.stdout)


if __name__ == "__main__":
    main()
