"""
Subprocess runner for analysis nodes.
Reads JSON manifest from stdin: { "inputs": { "df_in": <parquet_b64>, ... }, "code": "..." }
Executes code, writes JSON result to stdout.

Output detection priority:
  1. ``df_out`` (DataFrame) — backward compatible
  2. ``result`` — any JSON-serializable value (scalar, dict, list, str)
  3. ``df`` — modified input DataFrame fallback
  4. Error if none is set
"""
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

        exec(code, namespace)  # noqa: S102

        # 1) Prefer df_out (DataFrame) — backward compatible
        output_df = namespace.get("df_out")
        if output_df is not None and isinstance(output_df, pd.DataFrame):
            buf = io.BytesIO()
            output_df.to_parquet(buf, index=False)
            b64_out = base64.b64encode(buf.getvalue()).decode()
            json.dump({"ok": True, "kind": "dataframe", "output": b64_out}, sys.stdout)
            return

        # 2) Fallback: detect `result` variable for generic outputs
        result_val = namespace.get("result")
        if result_val is not None:
            # Auto-detect kind
            if isinstance(result_val, pd.DataFrame):
                buf = io.BytesIO()
                result_val.to_parquet(buf, index=False)
                b64_out = base64.b64encode(buf.getvalue()).decode()
                json.dump({"ok": True, "kind": "dataframe", "output": b64_out}, sys.stdout)
                return

            if isinstance(result_val, dict):
                kind = "dict"
            elif isinstance(result_val, list):
                kind = "list"
            elif isinstance(result_val, str) and len(result_val) > 100:
                kind = "text"
            else:
                kind = "scalar"

            json.dump({
                "ok": True,
                "kind": kind,
                "generic_output": _make_serializable(result_val),
            }, sys.stdout)
            return

        # 3) Fallback: check if a variable named 'df' is a DataFrame
        df_var = namespace.get("df")
        if df_var is not None and isinstance(df_var, pd.DataFrame):
            buf = io.BytesIO()
            df_var.to_parquet(buf, index=False)
            b64_out = base64.b64encode(buf.getvalue()).decode()
            json.dump({"ok": True, "kind": "dataframe", "output": b64_out}, sys.stdout)
            return

        # 4) None of the output conventions matched
        json.dump({
            "ok": False,
            "error": "Code must assign result to `df_out` (DataFrame), `result` (any value), or `df` (DataFrame)",
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
