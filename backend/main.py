"""FastAPI: каталог відео, фічі, партитури (score), статичний фронтенд.

Запуск з кореня репозиторію:
    uvicorn backend.main:app --reload
"""
from __future__ import annotations

import json
import re
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from pipeline.catalog import DATA, RAW_DIR, features_path, get_video, load_catalog, raw_path
from sonify import build_score, load_presets
from sonify.auto import region_overrides

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"
SAMPLE = ROOT / "shared" / "examples" / "sample_features.json"
DESCRIPTIONS = DATA / "descriptions.json"

app = FastAPI(title="Earth Information Jukebox API")


def _read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _video_or_404(video_id: str) -> dict:
    if not re.fullmatch(r"[a-z0-9_]+", video_id):
        raise HTTPException(400, "bad id")
    try:
        return get_video(video_id)
    except KeyError:
        raise HTTPException(404, f"unknown video '{video_id}'")


def _features(video_id: str) -> dict:
    """Пораховані фічі або демо-дані (щоб фронтенд працював, поки pipeline не запущено)."""
    path = features_path(video_id)
    if path.exists():
        return _read_json(path)
    data = _read_json(SAMPLE)
    data.update(video_id=video_id, is_sample=True)
    return data


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/videos")
def list_videos() -> list[dict]:
    """Каталог + чи є фічі/локальне відео + тексти від №5 (data/descriptions.json)."""
    descriptions = _read_json(DESCRIPTIONS) if DESCRIPTIONS.exists() else {}
    out = []
    for v in load_catalog():
        out.append({
            "id": v["id"],
            "title": v["title"],
            "svs_page": v.get("svs_page"),
            "video_url": v.get("video_url"),
            "preset": v["preset"],
            "has_features": features_path(v["id"]).exists(),
            "has_local_video": raw_path(v["id"]).exists(),
            "local_video": raw_path(v["id"]).name if raw_path(v["id"]).exists() else None,
            "crop": v["crop"],  # [x, y, w, h] у пікселях оригіналу — фронт показує лише цю частину кадру
            "description": descriptions.get(v["id"], {}),
        })
    return out


@app.get("/api/features/{video_id}")
def get_features(video_id: str) -> dict:
    _video_or_404(video_id)
    return _features(video_id)


@app.get("/api/presets")
def get_presets() -> list[str]:
    return list(load_presets())


@app.get("/api/score/{video_id}")
def get_score(video_id: str, preset: str | None = None) -> dict:
    """Партитура для плеєра. ?preset=ocean — послухати з іншим пресетом."""
    cfg = _video_or_404(video_id)
    name = preset or cfg["preset"]
    features = _features(video_id)
    overrides = region_overrides(cfg, features) if name == cfg["preset"] else None
    return build_score(features, name, overrides=overrides)


# Локальні відео (data/raw/<id>.mp4|.webm) для плеєра: /media/<local_video>
app.mount("/media", StaticFiles(directory=RAW_DIR, check_dir=False), name="media")
class FreshStatic(StaticFiles):
    """Фронтенд без кешу: браузер щоразу перевіряє файл (ETag → 304, якщо не змінився).
    Інакше після правок JS/CSS браузер довго віддає стару версію з кешу."""
    async def get_response(self, path, scope):
        resp = await super().get_response(path, scope)
        resp.headers["Cache-Control"] = "no-cache"
        return resp


app.mount("/static", FreshStatic(directory=FRONTEND), name="static")


@app.get("/")
def index() -> FileResponse:
    return FileResponse(FRONTEND / "index.html", headers={"Cache-Control": "no-cache"})

