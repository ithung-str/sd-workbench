from __future__ import annotations

import math
import random
import statistics
from dataclasses import dataclass
from typing import Iterable

from fastapi import HTTPException

from app.schemas.model import (
    AuxNode,
    BatchSimulateResponse,
    BatchSimulateRequest,
    FlowNode,
    LookupNode,
    ModelDocument,
    MonteCarloParameter,
    MonteCarloQuantiles,
    MonteCarloRequest,
    MonteCarloResponse,
    MonteCarloRunMetric,
    OATSensitivityItem,
    OATSensitivityPoint,
    OATSensitivityRequest,
    OATSensitivityResponse,
    ScenarioDefinition,
    ScenarioOverrides,
    ScenarioRunError,
    ScenarioRunResult,
    SimConfig,
    SimConfigOverride,
    SimulateResponse,
    StockNode,
    ValidateResponse,
)
from app.simulation.executor import execute_model
from app.validation.schema import validate_structure
from app.validation.semantic import validate_semantics


VARIABLE_NODE_TYPES = (StockNode, AuxNode, FlowNode, LookupNode)


@dataclass(frozen=True)
class _ScenarioContext:
    scenario_id: str
    scenario_name: str
    overrides: ScenarioOverrides


def validate_model(model: ModelDocument) -> ValidateResponse:
    errors1, warnings1 = validate_structure(model)
    errors2, warnings2 = validate_semantics(model)
    errors = [*errors1, *errors2]
    warnings = [*warnings1, *warnings2]
    return ValidateResponse(ok=not errors, errors=errors, warnings=warnings, normalized=model)


def _serialize_validation_error(validation: ValidateResponse) -> HTTPException:
    return HTTPException(
        status_code=422,
        detail={
            "ok": False,
            "errors": [e.model_dump() for e in validation.errors],
            "warnings": [w.model_dump() for w in validation.warnings],
        },
    )


def simulate_model(model: ModelDocument, sim_config: SimConfig) -> SimulateResponse:
    validation = validate_model(model)
    if not validation.ok:
        raise _serialize_validation_error(validation)
    try:
        series, metadata = execute_model(model, sim_config)
    except Exception as exc:  # pragma: no cover
        raise HTTPException(
            status_code=500,
            detail={
                "ok": False,
                "errors": [
                    {
                        "code": "SIMULATION_RUNTIME_ERROR",
                        "message": str(exc),
                        "severity": "error",
                    }
                ],
                "warnings": [],
            },
        ) from exc

    return SimulateResponse(ok=True, series=series, warnings=validation.warnings, metadata=metadata)


def _apply_sim_config_override(base: SimConfig, override: SimConfigOverride | None) -> SimConfig:
    if override is None:
        return base
    return SimConfig(
        start=override.start if override.start is not None else base.start,
        stop=override.stop if override.stop is not None else base.stop,
        dt=override.dt if override.dt is not None else base.dt,
        return_step=override.return_step if override.return_step is not None else base.return_step,
        method=base.method,
    )


def _apply_param_overrides(model: ModelDocument, params: dict[str, float | str]) -> ModelDocument:
    if not params:
        return model
    updated = model.model_copy(deep=True)
    for node in updated.nodes:
        if not isinstance(node, VARIABLE_NODE_TYPES):
            continue
        value = params.get(node.name)
        if value is None:
            continue
        if isinstance(node, StockNode):
            node.initial_value = value
        else:
            node.equation = str(value)
    return updated


def _apply_overrides(model: ModelDocument, sim_config: SimConfig, overrides: ScenarioOverrides) -> tuple[ModelDocument, SimConfig]:
    updated_model = _apply_param_overrides(model, overrides.params)
    if overrides.outputs:
        updated_model.outputs = list(overrides.outputs)
    updated_config = _apply_sim_config_override(sim_config, overrides.sim_config)
    return updated_model, updated_config


def _scenario_contexts(scenarios: list[ScenarioDefinition], include_baseline: bool) -> list[_ScenarioContext]:
    out: list[_ScenarioContext] = []
    seen_ids: set[str] = set()
    if include_baseline:
        out.append(_ScenarioContext(scenario_id="baseline", scenario_name="Baseline", overrides=ScenarioOverrides()))
        seen_ids.add("baseline")
    for scenario in scenarios:
        if scenario.status == "archived":
            continue
        if scenario.id in seen_ids:
            continue
        seen_ids.add(scenario.id)
        out.append(
            _ScenarioContext(
                scenario_id=scenario.id,
                scenario_name=scenario.name,
                overrides=scenario.overrides,
            )
        )
    return out


def simulate_scenario_batch(request: BatchSimulateRequest) -> BatchSimulateResponse:
    runs: list[ScenarioRunResult] = []
    errors: list[ScenarioRunError] = []
    for context in _scenario_contexts(request.scenarios, request.include_baseline):
        model, sim_config = _apply_overrides(request.model, request.sim_config, context.overrides)
        try:
            response = simulate_model(model, sim_config)
            runs.append(
                ScenarioRunResult(
                    scenario_id=context.scenario_id,
                    scenario_name=context.scenario_name,
                    series=response.series,
                    warnings=response.warnings,
                    metadata=response.metadata,
                )
            )
        except HTTPException as exc:
            detail = exc.detail if isinstance(exc.detail, dict) else {"errors": []}
            first_error = (detail.get("errors") or [{"code": "SCENARIO_SIMULATION_ERROR", "message": "Scenario failed"}])[0]
            errors.append(
                ScenarioRunError(
                    scenario_id=context.scenario_id,
                    scenario_name=context.scenario_name,
                    code=str(first_error.get("code", "SCENARIO_SIMULATION_ERROR")),
                    message=str(first_error.get("message", "Scenario failed")),
                )
            )
    return BatchSimulateResponse(ok=not errors, runs=runs, errors=errors)


def _resolve_scenario(request_scenarios: list[ScenarioDefinition], scenario_id: str | None) -> _ScenarioContext:
    scenarios = [s for s in request_scenarios if s.status != "archived"]
    if scenario_id:
        for scenario in scenarios:
            if scenario.id == scenario_id:
                return _ScenarioContext(scenario_id=scenario.id, scenario_name=scenario.name, overrides=scenario.overrides)
        raise HTTPException(status_code=404, detail={"ok": False, "errors": [{"code": "SCENARIO_NOT_FOUND", "message": f"Scenario '{scenario_id}' not found", "severity": "error"}]})

    baseline = next((s for s in scenarios if s.status == "baseline"), None)
    if baseline:
        return _ScenarioContext(scenario_id=baseline.id, scenario_name=baseline.name, overrides=baseline.overrides)
    return _ScenarioContext(scenario_id="baseline", scenario_name="Baseline", overrides=ScenarioOverrides())


def _select_metric(values: list[float], metric: str) -> float:
    if not values:
        return float("nan")
    if metric == "final":
        return values[-1]
    if metric == "max":
        return max(values)
    if metric == "min":
        return min(values)
    return float(sum(values) / len(values))


def _extract_metric(series: dict[str, list[float]], output: str, metric: str) -> float:
    values = series.get(output)
    if values is None:
        raise HTTPException(status_code=422, detail={"ok": False, "errors": [{"code": "OUTPUT_NOT_FOUND", "message": f"Output '{output}' not found in simulation results", "severity": "error"}]})
    metric_value = _select_metric(values, metric)
    if not math.isfinite(metric_value):
        raise HTTPException(status_code=422, detail={"ok": False, "errors": [{"code": "OUTPUT_NOT_FINITE", "message": f"Output '{output}' generated non-finite values", "severity": "error"}]})
    return metric_value


def run_oat_sensitivity(request: OATSensitivityRequest) -> OATSensitivityResponse:
    context = _resolve_scenario(request.scenarios, request.scenario_id)
    base_model, base_config = _apply_overrides(request.model, request.sim_config, context.overrides)
    baseline = simulate_model(base_model, base_config)
    baseline_metric = _extract_metric(baseline.series, request.output, request.metric)

    items: list[OATSensitivityItem] = []
    for parameter in request.parameters:
        points: list[OATSensitivityPoint] = []
        step = (parameter.high - parameter.low) / (parameter.steps - 1)
        for idx in range(parameter.steps):
            value = parameter.low + idx * step
            overrides = context.overrides.model_copy(deep=True)
            overrides.params[parameter.name] = value
            model, sim_config = _apply_overrides(request.model, request.sim_config, overrides)
            response = simulate_model(model, sim_config)
            metric_value = _extract_metric(response.series, request.output, request.metric)
            points.append(OATSensitivityPoint(parameter=parameter.name, value=value, metric_value=metric_value))

        metric_values = [p.metric_value for p in points]
        min_metric = min(metric_values)
        max_metric = max(metric_values)
        swing = max_metric - min_metric
        normalized = 0.0 if baseline_metric == 0 else swing / abs(baseline_metric)
        items.append(
            OATSensitivityItem(
                parameter=parameter.name,
                baseline_metric=baseline_metric,
                min_metric=min_metric,
                max_metric=max_metric,
                swing=swing,
                normalized_swing=normalized,
                points=points,
            )
        )

    items.sort(key=lambda item: item.normalized_swing, reverse=True)
    return OATSensitivityResponse(
        ok=True,
        scenario_id=context.scenario_id,
        output=request.output,
        metric=request.metric,
        baseline_metric=baseline_metric,
        items=items,
    )


def _sample_parameter(rng: random.Random, spec: MonteCarloParameter) -> float:
    if spec.distribution == "uniform":
        low = spec.min if spec.min is not None else 0.0
        high = spec.max if spec.max is not None else 1.0
        return rng.uniform(low, high)
    if spec.distribution == "normal":
        mean = spec.mean if spec.mean is not None else 0.0
        stddev = spec.stddev if spec.stddev is not None else 1.0
        value = rng.gauss(mean, stddev)
        if spec.min is not None:
            value = max(spec.min, value)
        if spec.max is not None:
            value = min(spec.max, value)
        return value

    low = spec.min if spec.min is not None else 0.0
    high = spec.max if spec.max is not None else 1.0
    mode = spec.mode if spec.mode is not None else (low + high) / 2
    return rng.triangular(low, high, mode)


def _quantile(sorted_values: list[float], q: float) -> float:
    if not sorted_values:
        return float("nan")
    if len(sorted_values) == 1:
        return sorted_values[0]
    pos = (len(sorted_values) - 1) * q
    left = int(math.floor(pos))
    right = int(math.ceil(pos))
    if left == right:
        return sorted_values[left]
    frac = pos - left
    return sorted_values[left] * (1 - frac) + sorted_values[right] * frac


def run_monte_carlo(request: MonteCarloRequest) -> MonteCarloResponse:
    context = _resolve_scenario(request.scenarios, request.scenario_id)
    rng = random.Random(request.seed)

    metrics: list[float] = []
    samples: list[MonteCarloRunMetric] = []
    for run_index in range(request.runs):
        sampled_params = {spec.name: _sample_parameter(rng, spec) for spec in request.parameters}
        overrides = context.overrides.model_copy(deep=True)
        overrides.params.update(sampled_params)
        model, sim_config = _apply_overrides(request.model, request.sim_config, overrides)
        response = simulate_model(model, sim_config)
        metric_value = _extract_metric(response.series, request.output, request.metric)
        metrics.append(metric_value)
        samples.append(MonteCarloRunMetric(run_index=run_index, metric_value=metric_value, params=sampled_params))

    sorted_metrics = sorted(metrics)
    quantiles = MonteCarloQuantiles(
        p05=_quantile(sorted_metrics, 0.05),
        p25=_quantile(sorted_metrics, 0.25),
        p50=_quantile(sorted_metrics, 0.50),
        p75=_quantile(sorted_metrics, 0.75),
        p95=_quantile(sorted_metrics, 0.95),
        mean=statistics.fmean(metrics),
        stddev=statistics.pstdev(metrics),
        min=min(metrics),
        max=max(metrics),
    )

    return MonteCarloResponse(
        ok=True,
        scenario_id=context.scenario_id,
        output=request.output,
        metric=request.metric,
        runs=request.runs,
        seed=request.seed,
        quantiles=quantiles,
        samples=samples,
    )
