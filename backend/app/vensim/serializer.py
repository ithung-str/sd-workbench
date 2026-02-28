from __future__ import annotations

from app.schemas.model import ModelDocument
from app.schemas.vensim import VensimImportResponse, VensimModelView

# Placeholder for future richer serialization helpers. Kept separate to stabilize API shaping.


def has_canonical_view(response: VensimImportResponse) -> bool:
    return response.model_view.canonical is not None
