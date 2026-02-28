from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.model import ModelDocument, ValidationIssue


class AIExecuteRequest(BaseModel):
    prompt: str
    model: ModelDocument

    model_config = ConfigDict(extra="forbid")


class AIExecuteResponse(BaseModel):
    ok: bool
    model: ModelDocument
    warnings: list[ValidationIssue] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")
