"""
Subprocess runner for analysis nodes.
Reads JSON manifest from stdin: { "inputs": { "df_in": <parquet_b64>, ... }, "code": "..." }
Executes code, writes JSON result to stdout.
"""
import base64
import io
import json
import sys
import traceback


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

        output_df = namespace.get("df_out")
        if output_df is None or not isinstance(output_df, pd.DataFrame):
            json.dump({"ok": False, "error": "Code must assign result to `df_out`"}, sys.stdout)
            return

        buf = io.BytesIO()
        output_df.to_parquet(buf, index=False)
        b64_out = base64.b64encode(buf.getvalue()).decode()
        json.dump({"ok": True, "output": b64_out}, sys.stdout)

    except Exception:
        json.dump({"ok": False, "error": traceback.format_exc()}, sys.stdout)


if __name__ == "__main__":
    main()
