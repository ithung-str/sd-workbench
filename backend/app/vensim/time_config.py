from __future__ import annotations

from app.schemas.vensim import ImportedTimeSettings, VensimSimConfigOverride



def resolve_time_settings(imported: ImportedTimeSettings, override: VensimSimConfigOverride | None) -> ImportedTimeSettings:
    if override is None:
        return imported
    return ImportedTimeSettings(
        initial_time=override.start if override.start is not None else imported.initial_time,
        final_time=override.stop if override.stop is not None else imported.final_time,
        time_step=override.dt if override.dt is not None else imported.time_step,
        saveper=override.saveper if override.saveper is not None else imported.saveper,
    )
