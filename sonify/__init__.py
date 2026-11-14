"""Сонифікація: фічі (data/features/<id>.json) + пресет (sonify/presets.json) → score.json."""
from .score import build_score, load_presets

__all__ = ["build_score", "load_presets"]
