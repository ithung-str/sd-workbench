from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.model import ModelDocument, ValidationIssue


class AIChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str

    model_config = ConfigDict(extra="forbid")


class AIPatch(BaseModel):
    node_name: str
    field: str
    value: str | float | bool | None

    model_config = ConfigDict(extra="forbid")


class AIAction(BaseModel):
    type: str
    params: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(extra="forbid")


class AIExecuteRequest(BaseModel):
    prompt: str
    model: ModelDocument
    history: list[AIChatMessage] = Field(default_factory=list)
    sim_config: dict[str, Any] | None = None

    model_config = ConfigDict(extra="forbid")


class RetryLogEntry(BaseModel):
    round: int
    errors: list[str]
    action: str  # "retrying" | "escalated" | "success" | "gave_up"
    model_used: str | None = None

    model_config = ConfigDict(extra="forbid")


class StreamChunk(BaseModel):
    type: str       # "node" | "edge" | "action" | "message" | "clarification"
    data: dict[str, Any]
    status: str = "pending"   # "valid" | "warning" | "error"
    errors: list[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class AIExecuteResponse(BaseModel):
    ok: bool
    model: ModelDocument | None = None
    patches: list[AIPatch] = Field(default_factory=list)
    actions: list[AIAction] = Field(default_factory=list)
    warnings: list[ValidationIssue] = Field(default_factory=list)
    assistant_message: str = ""
    needs_clarification: bool = False
    suggestions: list[str] = Field(default_factory=list)
    retry_log: list[RetryLogEntry] = Field(default_factory=list)
    debug_raw_response: str | None = None
    chunks: list[dict[str, Any]] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")
