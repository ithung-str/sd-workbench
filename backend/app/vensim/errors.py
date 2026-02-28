from __future__ import annotations

from fastapi import HTTPException


def vensim_http_error(status_code: int, code: str, message: str, warnings: list[dict] | None = None) -> HTTPException:
    return HTTPException(
        status_code=status_code,
        detail={
            "ok": False,
            "errors": [{"code": code, "message": message, "severity": "error"}],
            "warnings": warnings or [],
        },
    )
