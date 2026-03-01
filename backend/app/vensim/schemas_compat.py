from __future__ import annotations

from app.schemas.imported import (
    ImportedBatchSimulateRequest,
    ImportedMonteCarloRequest,
    ImportedOATSensitivityRequest,
    ImportedSimulateRequest,
)
from app.schemas.vensim import (
    VensimBatchSimulateRequest,
    VensimMonteCarloRequest,
    VensimOATSensitivityRequest,
    VensimSimConfigOverride,
    VensimSimulateRequest,
)


def _cfg(cfg):
    if cfg is None:
        return None
    return VensimSimConfigOverride(start=cfg.start, stop=cfg.stop, dt=cfg.dt, saveper=cfg.saveper)


def to_vensim_sim_request(request: ImportedSimulateRequest) -> VensimSimulateRequest:
    return VensimSimulateRequest(
        import_id=request.import_id,
        sim_config=_cfg(request.sim_config),
        outputs=request.outputs,
        params=request.params,
    )


def to_vensim_batch_request(request: ImportedBatchSimulateRequest) -> VensimBatchSimulateRequest:
    return VensimBatchSimulateRequest(
        import_id=request.import_id,
        sim_config=_cfg(request.sim_config),
        scenarios=request.scenarios,
        include_baseline=request.include_baseline,
        outputs=request.outputs,
    )


def to_vensim_oat_request(request: ImportedOATSensitivityRequest) -> VensimOATSensitivityRequest:
    return VensimOATSensitivityRequest(
        import_id=request.import_id,
        sim_config=_cfg(request.sim_config),
        scenarios=request.scenarios,
        scenario_id=request.scenario_id,
        output=request.output,
        metric=request.metric,
        parameters=request.parameters,
    )


def to_vensim_monte_carlo_request(request: ImportedMonteCarloRequest) -> VensimMonteCarloRequest:
    return VensimMonteCarloRequest(
        import_id=request.import_id,
        sim_config=_cfg(request.sim_config),
        scenarios=request.scenarios,
        scenario_id=request.scenario_id,
        output=request.output,
        metric=request.metric,
        runs=request.runs,
        seed=request.seed,
        parameters=request.parameters,
    )
