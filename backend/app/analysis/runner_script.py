"""
Subprocess runner for analysis nodes.
Reads JSON manifest from stdin: { "inputs": { "df_in": <parquet_b64>, ... }, "code": "..." }
Executes code, writes JSON result to stdout.

Output detection priority:
  1. ``df_out`` (DataFrame) — backward compatible
  2. ``result`` — any JSON-serializable value (scalar, dict, list, str)
  3. Error if neither is set
"""
import base64
import io
import json
import sys
import traceback


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
        from scipy import stats  # noqa: F401

        manifest = json.loads(sys.stdin.read())
        code = manifest["code"]
        input_data = manifest.get("inputs", {})

        namespace: dict = {"pd": pd, "np": np, "stats": stats}
        for name, b64 in input_data.items():
            buf = io.BytesIO(base64.b64decode(b64))
            namespace[name] = pd.read_parquet(buf)

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

        # 3) Neither df_out nor result set
        json.dump({
            "ok": False,
            "error": "Code must assign result to `df_out` (DataFrame) or `result` (any value)",
        }, sys.stdout)

    except Exception:
        json.dump({"ok": False, "error": traceback.format_exc()}, sys.stdout)


if __name__ == "__main__":
    main()
