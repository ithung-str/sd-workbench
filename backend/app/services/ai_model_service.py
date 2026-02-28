from __future__ import annotations

import json
import os
import re
from typing import Any

import httpx
from fastapi import HTTPException

from app.schemas.model import ModelDocument
from app.services.model_service import validate_model

GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


def _extract_json(text: str) -> dict[str, Any]:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = re.sub(r"^```(?:json)?\s*", "", stripped, flags=re.IGNORECASE)
        stripped = re.sub(r"\s*```$", "", stripped)
    try:
        return json.loads(stripped)
    except Exception:
        # fallback: first object
        match = re.search(r"\{.*\}", stripped, flags=re.DOTALL)
        if not match:
            raise ValueError("No JSON object found in model output")
        return json.loads(match.group(0))


def _gemini_key() -> str:
    key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not key:
        raise HTTPException(status_code=500, detail={"ok": False, "errors": [{"code": "AI_CONFIG_ERROR", "message": "Missing GEMINI_API_KEY/GOOGLE_API_KEY", "severity": "error"}]})
    return key


def _gemini_model() -> str:
    return os.getenv("GEMINI_MODEL", "gemini-2.0-flash")


def _system_instructions() -> str:
    return (
        "You are an SD-model editor engine. Return ONLY JSON and no prose.\n"
        "Task: apply the user's command to the provided model JSON.\n"
        "Output format: {\"model\": <full model document>}.\n"
        "Do not omit required fields. Keep IDs stable where possible.\n"
        "Supported node types: stock, flow, aux, lookup, text.\n"
        "Supported edge types: influence, flow_link.\n"
        "Rules:\n"
        "- text nodes are annotations and must never appear in equations or outputs.\n"
        "- lookup nodes must include >=2 sorted unique x points.\n"
        "- equations refer to variable names, not ids.\n"
        "- preserve existing unrelated nodes/edges.\n"
        "- if adding flow connections, use flow_link edges between stock and flow.\n"
        "- never return commentary; JSON only.\n"
    )


def _gemini_request_body(prompt: str, model: ModelDocument) -> dict[str, Any]:
    return {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {"text": _system_instructions()},
                    {"text": f"User command:\n{prompt}"},
                    {"text": "Current model JSON:"},
                    {"text": json.dumps(model.model_dump(), ensure_ascii=True)},
                ],
            }
        ],
        "generationConfig": {
            "temperature": 0,
            "responseMimeType": "application/json",
        },
    }


def _call_gemini(prompt: str, model: ModelDocument) -> dict[str, Any]:
    key = _gemini_key()
    url = GEMINI_ENDPOINT.format(model=_gemini_model())
    params = {"key": key}
    payload = _gemini_request_body(prompt, model)
    try:
        with httpx.Client(timeout=45.0) as client:
            res = client.post(url, params=params, json=payload)
    except Exception as exc:
        raise HTTPException(status_code=502, detail={"ok": False, "errors": [{"code": "AI_UPSTREAM_ERROR", "message": f"Gemini call failed: {exc}", "severity": "error"}]}) from exc
    if res.status_code >= 400:
        raise HTTPException(status_code=502, detail={"ok": False, "errors": [{"code": "AI_UPSTREAM_ERROR", "message": f"Gemini returned {res.status_code}: {res.text}", "severity": "error"}]})
    body = res.json()
    try:
        text = body["candidates"][0]["content"]["parts"][0]["text"]
    except Exception as exc:
        raise HTTPException(status_code=502, detail={"ok": False, "errors": [{"code": "AI_BAD_RESPONSE", "message": f"Could not parse Gemini response envelope: {exc}", "severity": "error"}]}) from exc
    try:
        return _extract_json(text)
    except Exception as exc:
        raise HTTPException(status_code=502, detail={"ok": False, "errors": [{"code": "AI_BAD_RESPONSE", "message": f"Gemini did not return valid JSON: {exc}", "severity": "error"}]}) from exc


def execute_ai_command(prompt: str, model: ModelDocument) -> tuple[ModelDocument, list]:
    if not prompt.strip():
        raise HTTPException(status_code=400, detail={"ok": False, "errors": [{"code": "AI_PROMPT_REQUIRED", "message": "Prompt is required", "severity": "error"}]})
    result = _call_gemini(prompt.strip(), model)
    if "model" not in result:
        raise HTTPException(status_code=502, detail={"ok": False, "errors": [{"code": "AI_BAD_RESPONSE", "message": "Missing 'model' in Gemini JSON output", "severity": "error"}]})
    updated_model = ModelDocument.model_validate(result["model"])
    validation = validate_model(updated_model)
    if not validation.ok:
        raise HTTPException(
            status_code=422,
            detail={
                "ok": False,
                "errors": [e.model_dump() for e in validation.errors],
                "warnings": [w.model_dump() for w in validation.warnings],
            },
        )
    return updated_model, validation.warnings
