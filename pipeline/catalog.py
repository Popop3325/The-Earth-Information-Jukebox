"""Доступ до data/catalog.json і шляхів даних. Використовують pipeline, sonify і backend."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
RAW_DIR = DATA / "raw"
FEATURES_DIR = DATA / "features"
CATALOG = DATA / "catalog.json"

DEFAULTS = {
    "extractors": ["basic"],
    "crop": None,
    "exclude": [],
    "keyframes": [],
    "preset": "default",
    "sample_fps": 5,
}


def load_catalog() -> list[dict]:
    videos = json.loads(CATALOG.read_text(encoding="utf-8"))["videos"]
    return [{**DEFAULTS, **v} for v in videos]


def get_video(video_id: str) -> dict:
    for v in load_catalog():
        if v["id"] == video_id:
            return v
    raise KeyError(f"Відео '{video_id}' немає в data/catalog.json")


def raw_path(video_id: str) -> Path:
    return RAW_DIR / f"{video_id}.mp4"


def features_path(video_id: str) -> Path:
    return FEATURES_DIR / f"{video_id}.json"
