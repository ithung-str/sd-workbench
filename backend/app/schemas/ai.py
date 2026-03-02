from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.model import ModelDocument, ValidationIssue


class AIChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str

    model_config = ConfigDict(extra="forbid")


class AIExecuteRequest(BaseModel):
    prompt: str
    model: ModelDocument
    history: list[AIChatMessage] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class AIExecuteResponse(BaseModel):
    ok: bool
    model: ModelDocument | None = None
    warnings: list[ValidationIssue] = Field(default_factory=list)
    assistant_message: str = ""
    needs_clarification: bool = False

    model_config = ConfigDict(extra="forbid")
