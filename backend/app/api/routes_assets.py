"""Asset API routes — unified data management layer."""
from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import PlainTextResponse, StreamingResponse

from app.schemas.asset import (
    AssetCreate,
    AssetDetail,
    AssetMeta,
    AssetPublish,
    AssetUpdate,
    AssetVersionMeta,
)
from app.services import asset_service

router = APIRouter(prefix="/api/assets", tags=["assets"])


@router.get("", response_model=list[AssetMeta])
def list_assets(
    kind: str | None = None,
    source: str | None = None,
    tag: str | None = None,
    search: str | None = None,
    pipeline_id: str | None = None,
) -> list[AssetMeta]:
    return asset_service.list_assets(
        kind=kind, source=source, tag=tag, search=search, pipeline_id=pipeline_id,
    )


@router.get("/by-slug/{slug}", response_model=AssetDetail)
def get_asset_by_slug(slug: str) -> AssetDetail:
    asset = asset_service.get_asset_by_slug(slug)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return asset


@router.get("/by-slug/{slug}/data")
def get_asset_data_by_slug(slug: str, format: str = Query("json")):
    asset = asset_service.get_asset_by_slug(slug)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return _serve_data(asset, format)


@router.get("/{asset_id}", response_model=AssetDetail)
def get_asset(asset_id: str) -> AssetDetail:
    asset = asset_service.get_asset(asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return asset


@router.get("/{asset_id}/data")
def get_asset_data(asset_id: str, format: str = Query("json")):
    asset = asset_service.get_asset(asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return _serve_data(asset, format)


@router.get("/{asset_id}/versions", response_model=list[AssetVersionMeta])
def get_asset_versions(asset_id: str) -> list[AssetVersionMeta]:
    versions = asset_service.get_asset_versions(asset_id)
    if not versions:
        raise HTTPException(status_code=404, detail="Asset not found")
    return versions


@router.post("", response_model=AssetMeta, status_code=201)
def create_asset(body: AssetCreate) -> AssetMeta:
    return asset_service.create_asset(body)


@router.put("/{asset_id}", response_model=AssetMeta)
def update_asset(asset_id: str, body: AssetUpdate) -> AssetMeta:
    result = asset_service.update_asset(asset_id, body)
    if not result:
        raise HTTPException(status_code=404, detail="Asset not found")
    return result


@router.delete("/{asset_id}", status_code=204)
def delete_asset(asset_id: str) -> None:
    if not asset_service.delete_asset(asset_id):
        raise HTTPException(status_code=404, detail="Asset not found")


@router.post("/{asset_id}/publish", response_model=AssetMeta, status_code=201)
def publish_version(asset_id: str, body: AssetPublish) -> AssetMeta:
    try:
        return asset_service.publish_version(asset_id, body)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ── Helpers ──


def _serve_data(asset: AssetDetail, fmt: str):
    """Serve asset content in the requested format."""
    if fmt == "csv":
        csv_data = asset_service.get_asset_data_csv(asset.id)
        if csv_data is None:
            raise HTTPException(status_code=400, detail="CSV export not available for this asset kind")
        filename = (asset.slug or asset.name or "export").replace('"', "'") + ".csv"
        import io
        return StreamingResponse(
            io.StringIO(csv_data),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    if fmt == "yaml":
        yaml_data = asset_service.get_asset_data_yaml(asset.id)
        if yaml_data is None:
            raise HTTPException(status_code=400, detail="YAML export not available for this asset kind")
        return PlainTextResponse(yaml_data, media_type="text/yaml")

    if fmt == "raw":
        if asset.content_text is not None:
            return PlainTextResponse(asset.content_text)
        raise HTTPException(status_code=400, detail="Raw format only available for file assets")

    # Default: json
    if asset.kind == "table":
        columns = [c.model_dump() for c in asset.columns] if asset.columns else []
        return {"columns": columns, "rows": asset.rows or []}
    if asset.kind == "file":
        return {"content": asset.content_text}
    if asset.kind == "value":
        return {"value": asset.value}
    return {"data": None}
