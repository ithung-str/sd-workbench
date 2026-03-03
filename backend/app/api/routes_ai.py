from __future__ import annotations

import json

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.schemas.ai import AIExecuteRequest, AIExecuteResponse
from app.services.ai_model_service import execute_ai_command, execute_ai_command_stream

router = APIRouter(prefix="/api")


@router.post("/ai/execute", response_model=AIExecuteResponse)
def ai_execute_endpoint(request: AIExecuteRequest) -> AIExecuteResponse:
    model, patches, actions, warnings, message, needs_clarification, suggestions, retry_log = execute_ai_command(
        request.prompt, request.model, request.history or None, request.sim_config
    )
    return AIExecuteResponse(
        ok=True,
        model=model,
        patches=patches,
        actions=actions,
        warnings=warnings,
        assistant_message=message,
        needs_clarification=needs_clarification,
        suggestions=suggestions,
        retry_log=retry_log,
    )


@router.post("/ai/execute-stream")
async def ai_execute_stream_endpoint(request: AIExecuteRequest) -> StreamingResponse:
    async def event_generator():
        async for event in execute_ai_command_stream(
            request.prompt, request.model, request.history or None, request.sim_config
        ):
            event_type = event.get("event", "status")
            data = json.dumps(event.get("data", {}), default=str)
            yield f"event: {event_type}\ndata: {data}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
