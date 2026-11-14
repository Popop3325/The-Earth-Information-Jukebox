"""Land cover: частки лісу/зелені, забудови, води й хмар на супутниковому знімку.

Перенесено з прототипу гри (prototypes/forest-neurons/prepare.py).
Зараз це ПРАВИЛА за кольором (пороги RGB). Задача для ML (№1): замінити на
класифікатор, див. docs/tasks/1-ml-backend.md.

Частки рахуються від «видимої» площі: пікселі маски без хмар.
"""
from __future__ import annotations

import numpy as np

LANDCOVER_FEATURES = [
    "green",   # частка рослинності (ліс, поля)
    "built",   # частка забудови / оголеного ґрунту (світлі незелені ділянки)
    "water",   # частка води
    "cloud",   # частка хмар (від усієї маски)
]


def classify_rules(frame_bgr: np.ndarray) -> dict[str, np.ndarray]:
    """Повертає булеві маски класів. Пороги підібрано для Landsat true color."""
    a = frame_bgr.astype(np.int16)
    b, g, r = a[..., 0], a[..., 1], a[..., 2]
    bright = (r + g + b) / 3
    cloud = np.minimum(np.minimum(r, g), b) > 200
    water = (b > g + 15) & (b > r + 25) & ~cloud
    green = (g > r + 3) & (g > b + 3) & ~cloud & ~water
    built = ~green & ~water & ~cloud & (bright > 90)
    return {"green": green, "built": built, "water": water, "cloud": cloud}


def compute_landcover(frame_bgr: np.ndarray, mask: np.ndarray, state: dict) -> dict:
    classes = classify_rules(frame_bgr)
    total = max(int(mask.sum()), 1)
    visible = max(int((mask & ~classes["cloud"]).sum()), 1)
    return {
        "green": float((classes["green"] & mask).sum() / visible),
        "built": float((classes["built"] & mask).sum() / visible),
        "water": float((classes["water"] & mask).sum() / visible),
        "cloud": float((classes["cloud"] & mask).sum() / total),
    }
