import base64
import io
import json
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

RUNNER_SCRIPT = str(Path(__file__).parent / "runner_script.py")
DEFAULT_TIMEOUT = 30


@dataclass
class NodeResult:
    ok: bool
    output_df: pd.DataFrame | None = None
    logs: str = ""
    error: str | None = None


def _serialize_df(df: pd.DataFrame) -> str:
    buf = io.BytesIO()
    df.to_parquet(buf, index=False)
    return base64.b64encode(buf.getvalue()).decode()


def _deserialize_df(b64: str) -> pd.DataFrame:
    buf = io.BytesIO(base64.b64decode(b64))
    return pd.read_parquet(buf)


def execute_node(
    code: str,
    inputs: dict[str, pd.DataFrame],
    timeout: int = DEFAULT_TIMEOUT,
) -> NodeResult:
    """Execute a code node in a subprocess. This is the swappable boundary."""
    serialized_inputs = {name: _serialize_df(df) for name, df in inputs.items()}
    manifest = json.dumps({"code": code, "inputs": serialized_inputs})

    try:
        result = subprocess.run(
            [sys.executable, RUNNER_SCRIPT],
            input=manifest,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        return NodeResult(ok=False, error=f"Timeout: node exceeded {timeout}s limit")

    stderr = result.stderr.strip()

    if result.returncode != 0:
        return NodeResult(ok=False, error=stderr or f"Process exited with code {result.returncode}", logs=stderr)

    try:
        output = json.loads(result.stdout)
    except json.JSONDecodeError:
        return NodeResult(ok=False, error="Invalid output from runner", logs=stderr)

    if not output.get("ok"):
        return NodeResult(ok=False, error=output.get("error", "Unknown error"), logs=stderr)

    output_df = _deserialize_df(output["output"])
    return NodeResult(ok=True, output_df=output_df, logs=stderr)
