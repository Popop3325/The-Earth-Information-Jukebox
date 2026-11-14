"""Реєстр екстракторів фіч. Кожне відео в data/catalog.json вибирає свої (поле "extractors").

Екстрактор — функція (frame_bgr, mask, state) -> dict[назва фічі -> 0..1].
"""
from __future__ import annotations

from .features import BASIC_FEATURES, compute_basic
from .landcover import LANDCOVER_FEATURES, compute_landcover

EXTRACTORS = {
    "basic": (BASIC_FEATURES, compute_basic),
    "landcover": (LANDCOVER_FEATURES, compute_landcover),
}
