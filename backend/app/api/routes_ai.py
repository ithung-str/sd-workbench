from __future__ import annotations

from fastapi import APIRouter

from app.schemas.ai import AIExecuteRequest, AIExecuteResponse
from app.services.ai_model_service import execute_ai_command

router = APIRouter(prefix="/api")


@router.post("/ai/execute", response_model=AIExecuteResponse)
def ai_execute_endpoint(request: AIExecuteRequest) -> AIExecuteResponse:
    model, warnings, message, needs_clarification = execute_ai_command(
        request.prompt, request.model, request.history or None
    )
    return AIExecuteResponse(
        ok=True,
        model=model,
        warnings=warnings,
        assistant_message=message,
        needs_clarification=needs_clarification,
    )
