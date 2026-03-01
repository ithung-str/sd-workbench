from __future__ import annotations

from app.imports.cache import get_session
from app.imports.errors import imported_http_error
from app.schemas.imported import (
    ImportedBatchSimulateRequest,
    ImportedBatchSimulateResponse,
    ImportedDiagnosticsResponse,
    ImportedMonteCarloRequest,
    ImportedMonteCarloResponse,
    ImportedOATSensitivityRequest,
    ImportedOATSensitivityResponse,
    ImportedReadinessResponse,
    ImportedScenarioRunResult,
    ImportedSimulateMetadata,
    ImportedSimulateRequest,
    ImportedSimulateResponse,
    ImportedTimeSettings,
)
from app.schemas.model import (
    BatchSimulateRequest,
    MonteCarloRequest,
    OATSensitivityRequest,
    ScenarioRunError,
    SimConfig,
    SimulateMetadata,
    SimulateRequest,
)
from app.services.model_service import run_monte_carlo, run_oat_sensitivity, simulate_model, simulate_scenario_batch
from app.vensim.schemas_compat import (
    to_vensim_batch_request,
    to_vensim_monte_carlo_request,
    to_vensim_oat_request,
    to_vensim_sim_request,
)
from app.vensim.simulator import (
    run_vensim_monte_carlo,
    run_vensim_oat_sensitivity,
    simulate_imported_vensim,
    simulate_imported_vensim_batch,
)


def _simcfg_from_imported(time: ImportedTimeSettings, override) -> SimConfig:
    return SimConfig(
        start=override.start if override and override.start is not None else (time.initial_time if time.initial_time is not None else 0),
        stop=override.stop if override and override.stop is not None else (time.final_time if time.final_time is not None else 100),
        dt=override.dt if override and override.dt is not None else (time.time_step if time.time_step is not None else 1),
        return_step=override.saveper if override and override.saveper is not None else (time.saveper if time.saveper is not None else None),
        method="euler",
    )


def _map_metadata(meta: SimulateMetadata, import_id: str, source_format: str, time: ImportedTimeSettings) -> ImportedSimulateMetadata:
    return ImportedSimulateMetadata(
        engine="internal_euler",
        source_format=source_format,
        import_id=import_id,
        row_count=meta.row_count,
        variables_returned=meta.variables_returned,
        time=time,
        execution_mode="native",
    )


def simulate_imported_model(request: ImportedSimulateRequest) -> ImportedSimulateResponse:
    session = get_session(request.import_id)
    if session is None:
        raise imported_http_error(404, "IM_IMPORT_EXPIRED", "Import session not found or expired")

    if session.source_format == "vensim-mdl":
        v = simulate_imported_vensim(to_vensim_sim_request(request))
        return ImportedSimulateResponse.model_validate(v.model_dump())

    if not session.canonical:
        raise imported_http_error(500, "IM_IMPORT_FAILED", "No canonical model available for this imported session")

    sim_config = _simcfg_from_imported(session.time_settings, request.sim_config)
    response = simulate_model(
        model=session.canonical,
        sim_config=sim_config,
    )

    return ImportedSimulateResponse(
        ok=True,
        series=response.series,
        warnings=response.warnings,
        metadata=_map_metadata(response.metadata, session.import_id, session.source_format, session.time_settings),
    )


def simulate_imported_model_batch(request: ImportedBatchSimulateRequest) -> ImportedBatchSimulateResponse:
    session = get_session(request.import_id)
    if session is None:
        raise imported_http_error(404, "IM_IMPORT_EXPIRED", "Import session not found or expired")

    if session.source_format == "vensim-mdl":
        v = simulate_imported_vensim_batch(to_vensim_batch_request(request))
        return ImportedBatchSimulateResponse.model_validate(v.model_dump())

    if not session.canonical:
        raise imported_http_error(500, "IM_IMPORT_FAILED", "No canonical model available for this imported session")

    sim_config = _simcfg_from_imported(session.time_settings, request.sim_config)
    result = simulate_scenario_batch(
        BatchSimulateRequest(
            model=session.canonical,
            sim_config=sim_config,
            scenarios=request.scenarios,
            include_baseline=request.include_baseline,
        )
    )

    runs = [
        ImportedScenarioRunResult(
            scenario_id=run.scenario_id,
            scenario_name=run.scenario_name,
            series=run.series,
            warnings=run.warnings,
            metadata=_map_metadata(run.metadata, session.import_id, session.source_format, session.time_settings),
        )
        for run in result.runs
    ]
    errors = [ScenarioRunError.model_validate(err.model_dump()) for err in result.errors]
    return ImportedBatchSimulateResponse(ok=result.ok, runs=runs, errors=errors)


def run_imported_oat_sensitivity(request: ImportedOATSensitivityRequest) -> ImportedOATSensitivityResponse:
    session = get_session(request.import_id)
    if session is None:
        raise imported_http_error(404, "IM_IMPORT_EXPIRED", "Import session not found or expired")
    if session.source_format == "vensim-mdl":
        return ImportedOATSensitivityResponse.model_validate(run_vensim_oat_sensitivity(to_vensim_oat_request(request)).model_dump())
    if not session.canonical:
        raise imported_http_error(500, "IM_IMPORT_FAILED", "No canonical model available for this imported session")

    sim_config = _simcfg_from_imported(session.time_settings, request.sim_config)
    result = run_oat_sensitivity(
        OATSensitivityRequest(
            model=session.canonical,
            sim_config=sim_config,
            scenarios=request.scenarios,
            scenario_id=request.scenario_id,
            output=request.output,
            metric=request.metric,
            parameters=request.parameters,
        )
    )
    return ImportedOATSensitivityResponse.model_validate(result.model_dump())


def run_imported_monte_carlo(request: ImportedMonteCarloRequest) -> ImportedMonteCarloResponse:
    session = get_session(request.import_id)
    if session is None:
        raise imported_http_error(404, "IM_IMPORT_EXPIRED", "Import session not found or expired")
    if session.source_format == "vensim-mdl":
        return ImportedMonteCarloResponse.model_validate(run_vensim_monte_carlo(to_vensim_monte_carlo_request(request)).model_dump())
    if not session.canonical:
        raise imported_http_error(500, "IM_IMPORT_FAILED", "No canonical model available for this imported session")

    sim_config = _simcfg_from_imported(session.time_settings, request.sim_config)
    result = run_monte_carlo(
        MonteCarloRequest(
            model=session.canonical,
            sim_config=sim_config,
            scenarios=request.scenarios,
            scenario_id=request.scenario_id,
            output=request.output,
            metric=request.metric,
            runs=request.runs,
            seed=request.seed,
            parameters=request.parameters,
        )
    )
    return ImportedMonteCarloResponse.model_validate(result.model_dump())


def diagnostics_for_import(import_id: str) -> ImportedDiagnosticsResponse:
    session = get_session(import_id)
    if session is None:
        raise imported_http_error(404, "IM_IMPORT_EXPIRED", "Import session not found or expired")
    return ImportedDiagnosticsResponse(
        ok=True,
        import_id=import_id,
        capabilities=session.capabilities,
        warnings=session.warnings or [],
        errors=session.errors or [],
        import_gaps=session.import_gaps,
    )


def readiness_for_import(import_id: str) -> ImportedReadinessResponse:
    session = get_session(import_id)
    if session is None:
        raise imported_http_error(404, "IM_IMPORT_EXPIRED", "Import session not found or expired")
    return ImportedReadinessResponse(
        ok=True,
        import_id=import_id,
        readiness=session.parity_readiness,
        reasons=session.parity_reasons,
    )
