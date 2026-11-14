"""FastAPI: каталог відео, фічі, партитури (score), квіз для гри, статичний фронтенд.

Запуск з кореня репозиторію:
    uvicorn backend.main:app --reload
"""
from __future__ import annotations

import json
import re
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from pipeline.catalog import DATA, RAW_DIR, features_path, get_video, load_catalog
from sonify import build_score, load_presets

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
            "has_local_video": (RAW_DIR / f"{v['id']}.mp4").exists(),
            "has_quiz": len(v["keyframes"]) >= 2,
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
    return build_score(_features(video_id), preset or cfg["preset"])


@app.get("/api/quiz/{video_id}")
def get_quiz(video_id: str) -> dict:
    """Пари сусідніх ключових кадрів для гри «де більше/менше».

    Налаштування в catalog.json, поле "quiz": {subject, metric, grows_with_metric}.
    Напр. для Канкуна: subject=birds, metric=built, grows_with_metric=false
    («птахів більше там, де менше забудови»).
    """
    cfg = _video_or_404(video_id)
    quiz = cfg.get("quiz")
    keyframes = _features(video_id).get("keyframes", [])
    if not quiz or len(keyframes) < 2:
        raise HTTPException(404, "для цього відео немає квізу (потрібні quiz і keyframes у catalog.json)")

    def subject_value(kf: dict) -> float:
        v = kf["metrics"][quiz["metric"]]
        return v if quiz.get("grows_with_metric", True) else -v

    pairs = []
    for i in range(len(keyframes) - 1):
        a, b = i, i + 1
        more = a if subject_value(keyframes[a]) >= subject_value(keyframes[b]) else b
        pairs.append({"a": a, "b": b, "more": more, "less": b if more == a else a})
    return {"video_id": video_id, "subject": quiz["subject"], "metric": quiz["metric"],
            "keyframes": keyframes, "pairs": pairs}


# Локальні відео (data/raw/<id>.mp4) для плеєра
app.mount("/media", StaticFiles(directory=RAW_DIR, check_dir=False), name="media")
app.mount("/static", StaticFiles(directory=FRONTEND), name="static")


@app.get("/")
def index() -> FileResponse:
    return FileResponse(FRONTEND / "index.html")


@app.get("/game")
def game() -> RedirectResponse:
    return RedirectResponse("/static/game/index.html")
