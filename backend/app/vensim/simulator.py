from __future__ import annotations

import math
import random
import statistics
from typing import Any

from fastapi import HTTPException

from app.schemas.model import OATSensitivityItem, OATSensitivityPoint, ScenarioDefinition, ScenarioRunError
from app.schemas.vensim import (
    ImportedTimeSettings,
    VensimBatchSimulateRequest,
    VensimBatchSimulateResponse,
    VensimMonteCarloQuantiles,
    VensimMonteCarloRequest,
    VensimMonteCarloResponse,
    VensimMonteCarloSample,
    VensimOATSensitivityRequest,
    VensimOATSensitivityResponse,
    VensimScenarioRunResult,
    VensimSimulateMetadata,
    VensimSimulateRequest,
    VensimSimulateResponse,
)
from app.vensim.cache import get_session
from app.vensim.errors import vensim_http_error
from app.vensim.fallbacks import kernel_names
from app.vensim.time_config import resolve_time_settings


def _make_time_grid(settings: ImportedTimeSettings) -> list[float] | None:
    if settings.initial_time is None or settings.final_time is None or settings.time_step is None:
        return None
    if settings.time_step <= 0:
        return None
    output_step = settings.saveper if settings.saveper is not None else settings.time_step
    if output_step <= 0:
        return None
    n_steps = int(round((settings.final_time - settings.initial_time) / output_step))
    return [round(settings.initial_time + i * output_step, 12) for i in range(n_steps + 1)]


def _run_pysd(model_handle: Any, outputs: list[str], params: dict[str, float | str], times: list[float] | None):
    kwargs: dict[str, Any] = {}
    if params:
        kwargs["params"] = params
    if times is not None:
        kwargs["return_timestamps"] = times
    if outputs:
        kwargs["return_columns"] = outputs
    # PySD API varies by version; progressively relax unsupported kwargs.
    try:
        return model_handle.run(**kwargs)
    except TypeError:
        kwargs2 = dict(kwargs)
        kwargs2.pop("return_columns", None)
        try:
            return model_handle.run(**kwargs2)
        except TypeError:
            kwargs3 = dict(kwargs2)
            kwargs3.pop("return_timestamps", None)
            return model_handle.run(**kwargs3)


def _plan_execution(session) -> tuple[str, list[str], list[str]]:
    details = session.capabilities.details if session and session.capabilities else []
    unsupported = sorted({d.function for d in details if d.support_mode == "unsupported"})
    fallback_needed = sorted({d.function for d in details if d.support_mode == "native_fallback"})
    available = kernel_names()
    blocked = [fn for fn in unsupported if fn not in available]
    if blocked:
        return "blocked", fallback_needed, blocked
    if fallback_needed:
        return "mixed", fallback_needed, []
    return "pysd", [], []


def simulate_imported_vensim(request: VensimSimulateRequest) -> VensimSimulateResponse:
    session = get_session(request.import_id)
    if session is None:
        raise vensim_http_error(404, "VENSIM_IMPORT_EXPIRED", "Import session not found or expired")
    if session.model_handle is None:
        raise vensim_http_error(500, "VENSIM_IMPORT_FAILED", "No PySD model loaded for this import session")
    execution_mode, fallback_activations, blocked = _plan_execution(session)
    if execution_mode == "blocked":
        raise vensim_http_error(
            422,
            "VENSIM_UNSUPPORTED_FEATURE",
            f"Unsupported functions without safe fallback: {', '.join(blocked)}",
        )

    resolved_time = resolve_time_settings(session.time_settings, request.sim_config)
    time_grid = _make_time_grid(resolved_time)
    selected_outputs = [name for name in (request.outputs or [v.name for v in session.variables[:20] if v.name]) if name]

    try:
        result_df = _run_pysd(session.model_handle, selected_outputs, request.params, time_grid)
    except Exception as exc:
        raise vensim_http_error(500, "VENSIM_EXECUTION_ERROR", f"PySD execution failed: {exc}")

    try:
        # PySD usually returns DataFrame indexed by time
        index = [float(x) for x in result_df.index.tolist()]
        series = {"time": index}
        for col in result_df.columns:
            series[str(col)] = [float(x) for x in result_df[col].tolist()]
    except Exception as exc:
        raise vensim_http_error(500, "VENSIM_EXECUTION_ERROR", f"Could not serialize PySD output: {exc}")

    warnings = list(session.warnings or [])
    if execution_mode == "mixed":
        warnings.append(
            {
                "code": "VENSIM_FALLBACK_ACTIVATED",
                "message": f"Mixed execution mode active; fallback kernels tracked for: {', '.join(fallback_activations)}",
                "severity": "warning",
            }
        )
    return VensimSimulateResponse(
        ok=True,
        series=series,
        warnings=warnings,
        metadata=VensimSimulateMetadata(
            engine="pysd",
            source_format="vensim-mdl",
            import_id=session.import_id,
            row_count=len(series.get("time", [])),
            variables_returned=list(series.keys()),
            time=ImportedTimeSettings(
                initial_time=series["time"][0] if series.get("time") else resolved_time.initial_time,
                final_time=series["time"][-1] if series.get("time") else resolved_time.final_time,
                time_step=resolved_time.time_step,
                saveper=resolved_time.saveper,
            ),
            execution_mode=execution_mode,  # pysd or mixed; blocked path fails earlier
            fallback_activations=fallback_activations,
        ),
    )


def _scenario_contexts(scenarios: list[ScenarioDefinition], include_baseline: bool) -> list[tuple[str, str, dict[str, float | str], list[str], Any]]:
    out: list[tuple[str, str, dict[str, float | str], list[str], Any]] = []
    seen_ids: set[str] = set()
    if include_baseline:
        out.append(("baseline", "Baseline", {}, [], None))
        seen_ids.add("baseline")
    for scenario in scenarios:
        if scenario.status == "archived":
            continue
        if scenario.id in seen_ids:
            continue
        seen_ids.add(scenario.id)
        out.append((scenario.id, scenario.name, dict(scenario.overrides.params), list(scenario.overrides.outputs), scenario.overrides.sim_config))
    return out


def _merge_sim_config(base, override):
    if override is None:
        return base
    return {
        "start": override.start if override.start is not None else (base.get("start") if base else None),
        "stop": override.stop if override.stop is not None else (base.get("stop") if base else None),
        "dt": override.dt if override.dt is not None else (base.get("dt") if base else None),
        "saveper": override.return_step if override.return_step is not None else (base.get("saveper") if base else None),
    }


def simulate_imported_vensim_batch(request: VensimBatchSimulateRequest) -> VensimBatchSimulateResponse:
    runs: list[VensimScenarioRunResult] = []
    errors: list[ScenarioRunError] = []

    for scenario_id, scenario_name, params, outputs, override in _scenario_contexts(request.scenarios, request.include_baseline):
        try:
            effective_outputs = outputs or request.outputs
            response = simulate_imported_vensim(
                VensimSimulateRequest(
                    import_id=request.import_id,
                    sim_config=_merge_sim_config(request.sim_config.model_dump() if request.sim_config else {}, override),
                    outputs=effective_outputs,
                    params=params,
                )
            )
            runs.append(
                VensimScenarioRunResult(
                    scenario_id=scenario_id,
                    scenario_name=scenario_name,
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
                    scenario_id=scenario_id,
                    scenario_name=scenario_name,
                    code=str(first_error.get("code", "SCENARIO_SIMULATION_ERROR")),
                    message=str(first_error.get("message", "Scenario failed")),
                )
            )

    return VensimBatchSimulateResponse(ok=not errors, runs=runs, errors=errors)


def _resolve_scenario(scenarios: list[ScenarioDefinition], scenario_id: str | None) -> ScenarioDefinition | None:
    live = [s for s in scenarios if s.status != "archived"]
    if scenario_id:
        return next((s for s in live if s.id == scenario_id), None)
    baseline = next((s for s in live if s.status == "baseline"), None)
    return baseline


def _select_metric(values: list[float], metric: str) -> float:
    if metric == "final":
        return values[-1]
    if metric == "max":
        return max(values)
    if metric == "min":
        return min(values)
    return float(sum(values) / len(values))


def _extract_metric(series: dict[str, list[float]], output: str, metric: str) -> float:
    values = series.get(output)
    if not values:
        raise HTTPException(status_code=422, detail={"ok": False, "errors": [{"code": "OUTPUT_NOT_FOUND", "message": f"Output '{output}' not found", "severity": "error"}]})
    val = _select_metric(values, metric)
    if not math.isfinite(val):
        raise HTTPException(status_code=422, detail={"ok": False, "errors": [{"code": "OUTPUT_NOT_FINITE", "message": f"Output '{output}' contains non-finite values", "severity": "error"}]})
    return val


def run_vensim_oat_sensitivity(request: VensimOATSensitivityRequest) -> VensimOATSensitivityResponse:
    scenario = _resolve_scenario(request.scenarios, request.scenario_id)
    base_params = dict(scenario.overrides.params) if scenario else {}
    base_outputs = list(scenario.overrides.outputs) if scenario and scenario.overrides.outputs else []
    base_override = scenario.overrides.sim_config if scenario else None

    baseline = simulate_imported_vensim(
        VensimSimulateRequest(
            import_id=request.import_id,
            sim_config=_merge_sim_config(request.sim_config.model_dump() if request.sim_config else {}, base_override),
            outputs=base_outputs or [request.output],
            params=base_params,
        )
    )
    baseline_metric = _extract_metric(baseline.series, request.output, request.metric)

    items: list[OATSensitivityItem] = []
    for parameter in request.parameters:
        step = (parameter.high - parameter.low) / (parameter.steps - 1)
        points: list[OATSensitivityPoint] = []
        for idx in range(parameter.steps):
            value = parameter.low + idx * step
            params = dict(base_params)
            params[parameter.name] = value
            response = simulate_imported_vensim(
                VensimSimulateRequest(
                    import_id=request.import_id,
                    sim_config=_merge_sim_config(request.sim_config.model_dump() if request.sim_config else {}, base_override),
                    outputs=base_outputs or [request.output],
                    params=params,
                )
            )
            points.append(
                OATSensitivityPoint(
                    parameter=parameter.name,
                    value=value,
                    metric_value=_extract_metric(response.series, request.output, request.metric),
                )
            )

        metrics = [p.metric_value for p in points]
        min_metric = min(metrics)
        max_metric = max(metrics)
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
    return VensimOATSensitivityResponse(
        ok=True,
        scenario_id=scenario.id if scenario else "baseline",
        output=request.output,
        metric=request.metric,
        baseline_metric=baseline_metric,
        items=items,
    )


def _sample_parameter(rng: random.Random, distribution: str, pmin, pmax, mean, stddev, mode) -> float:
    if distribution == "uniform":
        low = pmin if pmin is not None else 0.0
        high = pmax if pmax is not None else 1.0
        return rng.uniform(low, high)
    if distribution == "normal":
        mu = mean if mean is not None else 0.0
        sigma = stddev if stddev is not None else 1.0
        value = rng.gauss(mu, sigma)
        if pmin is not None:
            value = max(pmin, value)
        if pmax is not None:
            value = min(pmax, value)
        return value
    low = pmin if pmin is not None else 0.0
    high = pmax if pmax is not None else 1.0
    peak = mode if mode is not None else (low + high) / 2
    return rng.triangular(low, high, peak)


def _quantile(sorted_values: list[float], q: float) -> float:
    if len(sorted_values) == 1:
        return sorted_values[0]
    pos = (len(sorted_values) - 1) * q
    left = int(math.floor(pos))
    right = int(math.ceil(pos))
    if left == right:
        return sorted_values[left]
    frac = pos - left
    return sorted_values[left] * (1 - frac) + sorted_values[right] * frac


def run_vensim_monte_carlo(request: VensimMonteCarloRequest) -> VensimMonteCarloResponse:
    scenario = _resolve_scenario(request.scenarios, request.scenario_id)
    base_params = dict(scenario.overrides.params) if scenario else {}
    base_outputs = list(scenario.overrides.outputs) if scenario and scenario.overrides.outputs else []
    base_override = scenario.overrides.sim_config if scenario else None

    rng = random.Random(request.seed)
    metrics: list[float] = []
    samples: list[VensimMonteCarloSample] = []
    for run_index in range(request.runs):
        params = dict(base_params)
        sampled: dict[str, float] = {}
        for spec in request.parameters:
            value = _sample_parameter(rng, spec.distribution, spec.min, spec.max, spec.mean, spec.stddev, spec.mode)
            params[spec.name] = value
            sampled[spec.name] = value

        response = simulate_imported_vensim(
            VensimSimulateRequest(
                import_id=request.import_id,
                sim_config=_merge_sim_config(request.sim_config.model_dump() if request.sim_config else {}, base_override),
                outputs=base_outputs or [request.output],
                params=params,
            )
        )
        metric_value = _extract_metric(response.series, request.output, request.metric)
        metrics.append(metric_value)
        samples.append(VensimMonteCarloSample(run_index=run_index, metric_value=metric_value, params=sampled))

    sorted_metrics = sorted(metrics)
    quantiles = VensimMonteCarloQuantiles(
        p05=_quantile(sorted_metrics, 0.05),
        p25=_quantile(sorted_metrics, 0.25),
        p50=_quantile(sorted_metrics, 0.5),
        p75=_quantile(sorted_metrics, 0.75),
        p95=_quantile(sorted_metrics, 0.95),
        mean=statistics.fmean(metrics),
        stddev=statistics.pstdev(metrics),
        min=min(metrics),
        max=max(metrics),
    )
    return VensimMonteCarloResponse(
        ok=True,
        scenario_id=scenario.id if scenario else "baseline",
        output=request.output,
        metric=request.metric,
        runs=request.runs,
        seed=request.seed,
        quantiles=quantiles,
        samples=samples,
    )
