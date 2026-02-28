from __future__ import annotations

import json
from pathlib import Path

from app.schemas.model import ModelDocument, SimConfig

GOLDEN_ROOT = Path(__file__).resolve().parents[1] / "golden_models"


def load_case(case_name: str) -> tuple[ModelDocument, SimConfig, Path, dict]:
    case_dir = GOLDEN_ROOT / case_name
    model = ModelDocument.model_validate_json((case_dir / "model.json").read_text())
    sim_config = SimConfig.model_validate_json((case_dir / "sim_config.json").read_text())
    tolerances = json.loads((case_dir / "tolerances.json").read_text())
    return model, sim_config, case_dir / "expected.csv", tolerances
