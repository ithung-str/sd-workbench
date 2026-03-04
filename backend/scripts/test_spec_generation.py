#!/usr/bin/env python3
"""Test harness: send each SD spec to the AI endpoint and validate the result.

Usage:
    # Test all specs (requires GEMINI_API_KEY):
    python backend/scripts/test_spec_generation.py

    # Test a single spec:
    python backend/scripts/test_spec_generation.py 06_01

    # Dry-run (just parse specs, don't call API):
    python backend/scripts/test_spec_generation.py --dry-run
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.schemas.model import ModelDocument
from app.services.model_service import validate_model

SPEC_DIR = Path(__file__).resolve().parents[2] / "frontend" / "models" / "SD_Model_Specifications"


def list_specs() -> list[Path]:
    return sorted(SPEC_DIR.glob("*.md"))


def test_one_spec(spec_path: Path, dry_run: bool = False) -> dict:
    """Test a single spec file. Returns a result dict."""
    spec_id = spec_path.stem
    content = spec_path.read_text()

    result = {"spec_id": spec_id, "status": "unknown", "errors": []}

    if dry_run:
        # Just verify the file is readable and has expected structure
        has_stocks = "stock" in content.lower()
        has_flows = "flow" in content.lower()
        result["status"] = "ok" if (has_stocks or has_flows) else "warning"
        if not has_stocks:
            result["errors"].append("No stocks section found")
        return result

    # Call the AI endpoint
    try:
        from app.services.ai_model_service import execute_ai_command, _preprocess_spec_prompt

        # Start with a blank model
        blank = ModelDocument(
            id="test", name="Test", version=1,
            nodes=[], edges=[], outputs=[],
        )

        prompt = f"Build a complete SD model from this specification:\n\n{content}"
        processed = _preprocess_spec_prompt(prompt)

        updated_model, patches, actions, warnings, message, needs_clarification, suggestions, retry_log = (
            execute_ai_command(processed, blank)
        )

        if needs_clarification:
            result["status"] = "clarification"
            result["errors"].append(f"AI asked for clarification: {message}")
            return result

        if updated_model is None:
            result["status"] = "fail"
            result["errors"].append("AI did not return a model")
            return result

        # Validate the model
        validation = validate_model(updated_model)
        if not validation.ok:
            result["status"] = "validation_fail"
            result["errors"] = [e.message for e in validation.errors]
        else:
            result["status"] = "ok"
            result["node_count"] = len(updated_model.nodes)
            result["edge_count"] = len(updated_model.edges)

        if retry_log:
            result["retry_rounds"] = len(retry_log)

    except Exception as e:
        result["status"] = "error"
        result["errors"].append(str(e))

    return result


def main():
    parser = argparse.ArgumentParser(description="Test AI spec generation")
    parser.add_argument("spec_id", nargs="?", help="Specific spec ID to test (e.g. 06_01)")
    parser.add_argument("--dry-run", action="store_true", help="Just parse specs, don't call API")
    args = parser.parse_args()

    specs = list_specs()
    if args.spec_id:
        specs = [s for s in specs if args.spec_id in s.stem]
        if not specs:
            print(f"No spec found matching '{args.spec_id}'")
            sys.exit(1)

    print(f"Testing {len(specs)} specs {'(dry-run)' if args.dry_run else ''}\n")

    results = []
    for spec_path in specs:
        print(f"  {spec_path.stem} ... ", end="", flush=True)
        start = time.time()
        result = test_one_spec(spec_path, dry_run=args.dry_run)
        elapsed = time.time() - start
        result["elapsed_s"] = round(elapsed, 1)

        status_icon = {"ok": "PASS", "fail": "FAIL", "error": "ERR", "clarification": "CLAR",
                       "validation_fail": "VFAIL", "warning": "WARN"}.get(result["status"], "?")
        extra = ""
        if result.get("node_count"):
            extra = f" ({result['node_count']} nodes, {result['edge_count']} edges)"
        if result.get("errors"):
            extra += f" — {result['errors'][0][:80]}"
        print(f"[{status_icon}] {result['elapsed_s']}s{extra}")

        results.append(result)

        # Rate-limit API calls
        if not args.dry_run:
            time.sleep(2)

    # Summary
    passed = sum(1 for r in results if r["status"] == "ok")
    failed = sum(1 for r in results if r["status"] in ("fail", "error", "validation_fail"))
    other = len(results) - passed - failed
    print(f"\n{'='*60}")
    print(f"Results: {passed} passed, {failed} failed, {other} other / {len(results)} total")


if __name__ == "__main__":
    main()
