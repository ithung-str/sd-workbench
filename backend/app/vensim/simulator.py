from __future__ import annotations

from typing import Any

from app.schemas.model import ValidationIssue
from app.schemas.vensim import (
    ImportedTimeSettings,
    VensimSimulateMetadata,
    VensimSimulateRequest,
    VensimSimulateResponse,
)
from app.vensim.cache import get_session
from app.vensim.errors import vensim_http_error
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



def simulate_imported_vensim(request: VensimSimulateRequest) -> VensimSimulateResponse:
    session = get_session(request.import_id)
    if session is None:
        raise vensim_http_error(404, "VENSIM_IMPORT_EXPIRED", "Import session not found or expired")
    if session.model_handle is None:
        raise vensim_http_error(500, "VENSIM_IMPORT_FAILED", "No PySD model loaded for this import session")

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

    warnings = [ValidationIssue.model_validate(w) for w in session.warnings] if session.warnings else []
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
        ),
    )
