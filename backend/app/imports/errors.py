from __future__ import annotations

from fastapi import HTTPException


def imported_http_error(status_code: int, code: str, message: str, warnings: list[dict] | None = None) -> HTTPException:
    payload: dict = {
        "ok": False,
        "errors": [
            {
                "code": code,
                "message": message,
                "severity": "error",
            }
        ],
    }
    if warnings:
        payload["warnings"] = warnings
    return HTTPException(status_code=status_code, detail=payload)
