from __future__ import annotations

import json
import logging

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.schemas.ai import AIExecuteRequest, AIExecuteResponse
from app.services.ai_model_service import execute_ai_command, execute_ai_command_stream, execute_ai_command_stream_jsonl

router = APIRouter(prefix="/api")
_log = logging.getLogger(__name__)


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
        async for event in execute_ai_command_stream_jsonl(
            request.prompt, request.model, request.history or None, request.sim_config
        ):
            event_type = event.get("event", "status")
            data = json.dumps(event.get("data", {}), default=str)
            yield f"event: {event_type}\ndata: {data}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# AI-assisted node metadata (title + description)
# ---------------------------------------------------------------------------


class NodeDescribeRequest(BaseModel):
    node_type: str  # data_source | code | sql | output | publish | sheets_export
    code: str | None = None
    sql: str | None = None
    columns: list[str] | None = None
    current_name: str | None = None
    current_description: str | None = None
    input_columns: list[str] | None = None


class NodeDescribeResponse(BaseModel):
    ok: bool
    name: str | None = None
    description: str | None = None
    error: str | None = None


_DESCRIBE_SYSTEM = (
    "You are a helpful assistant for a data analysis pipeline tool. "
    "Given information about a pipeline node, suggest a short title (2-5 words, no quotes) "
    "and a one-sentence description of what the node does.\n"
    "Return ONLY JSON: {\"name\": \"...\", \"description\": \"...\"}\n"
    "No markdown, no code fences, no extra text."
)


def _build_describe_prompt(req: NodeDescribeRequest) -> str:
    parts = [f"Node type: {req.node_type}"]
    if req.code:
        parts.append(f"Python code:\n```\n{req.code[:2000]}\n```")
    if req.sql:
        parts.append(f"SQL query:\n```\n{req.sql[:2000]}\n```")
    if req.columns:
        parts.append(f"Table columns: {', '.join(req.columns[:50])}")
    if req.input_columns:
        parts.append(f"Input columns from upstream: {', '.join(req.input_columns[:50])}")
    if req.current_name:
        parts.append(f"Current name: {req.current_name}")
    if req.current_description:
        parts.append(f"Current description: {req.current_description}")
    parts.append("Suggest a concise name and description for this node.")
    return "\n".join(parts)


@router.post("/ai/describe-node", response_model=NodeDescribeResponse)
def ai_describe_node(request: NodeDescribeRequest) -> NodeDescribeResponse:
    """Use Gemini to suggest a name and description for an analysis node."""
    try:
        from app.services.ai_model_service import _gemini_key, _gemini_model, _gemini_endpoint, _send_gemini_request

        key = _gemini_key()
        model_name = _gemini_model()
        url = _gemini_endpoint(model_name)

        prompt = _build_describe_prompt(request)
        payload = {
            "system_instruction": {"parts": [{"text": _DESCRIBE_SYSTEM}]},
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.3,
                "maxOutputTokens": 2048,
                "responseMimeType": "application/json",
            },
        }
        parsed = _send_gemini_request(url, {"key": key}, payload)
        return NodeDescribeResponse(
            ok=True,
            name=parsed.get("name"),
            description=parsed.get("description"),
        )
    except Exception as exc:
        _log.exception("AI describe-node failed")
        return NodeDescribeResponse(ok=False, error=str(exc))
