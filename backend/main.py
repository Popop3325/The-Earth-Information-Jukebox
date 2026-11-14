"""FastAPI: віддає каталог відео, фічі та статичний фронтенд.

Запуск з кореня репозиторію:
    uvicorn backend.main:app --reload
"""
from __future__ import annotations

import json
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
SHARED = ROOT / "shared"
FRONTEND = ROOT / "frontend"
SAMPLE = SHARED / "examples" / "sample_features.json"

app = FastAPI(title="Earth Information Jukebox API")


def _read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/videos")
def list_videos() -> list[dict]:
    """Каталог відео + чи є для них пораховані фічі і локальний файл."""
    videos = _read_json(DATA / "catalog.json")["videos"]
    for v in videos:
        v["has_features"] = (DATA / "features" / f"{v['id']}.json").exists()
        v["has_local_video"] = (DATA / "raw" / f"{v['id']}.mp4").exists()
    return videos


@app.get("/api/features/{video_id}")
def get_features(video_id: str) -> dict:
    """Фічі відео. Якщо їх ще не пораховано, віддаємо приклад (щоб фронтенд міг працювати)."""
    if not video_id.replace("_", "").isalnum():
        raise HTTPException(400, "bad id")
    path = DATA / "features" / f"{video_id}.json"
    if path.exists():
        return _read_json(path)
    data = _read_json(SAMPLE)
    data["video_id"] = video_id
    data["is_sample"] = True
    return data


@app.get("/api/mapping")
def get_mapping() -> dict:
    return _read_json(SHARED / "mapping.json")


# Локальні відео (data/raw/<id>.mp4) для плеєра
app.mount("/media", StaticFiles(directory=DATA / "raw", check_dir=False), name="media")
app.mount("/static", StaticFiles(directory=FRONTEND), name="static")


@app.get("/")
def index() -> FileResponse:
    return FileResponse(FRONTEND / "index.html")
