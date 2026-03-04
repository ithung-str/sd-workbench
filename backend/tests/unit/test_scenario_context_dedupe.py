from app.schemas.model import ScenarioDefinition
from app.services.model_service import _scenario_contexts as native_scenario_contexts


def test_native_scenario_contexts_dedupes_baseline() -> None:
    scenarios = [
        ScenarioDefinition(id="baseline", name="Baseline", status="baseline"),
        ScenarioDefinition(id="policy_a", name="Policy A", status="policy"),
    ]
    contexts = native_scenario_contexts(scenarios, include_baseline=True)
    ids = [context.scenario_id for context in contexts]
    assert ids == ["baseline", "policy_a"]
