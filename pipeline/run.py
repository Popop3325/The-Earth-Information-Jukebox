"""CLI: відео → data/features/<id>.json

Налаштування (crop, exclude, extractors, keyframes) беруться з data/catalog.json.

Приклади:
    python -m pipeline.run cancun_landcover
    python -m pipeline.run night_lights --video ~/Downloads/lights.mp4 --sample-fps 4
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone

import pandas as pd

from .catalog import ROOT, features_path, get_video, raw_path
from .extractors import EXTRACTORS
from .frames import iter_frames, video_info

SCHEMA_VERSION = 1


def smooth(df: pd.DataFrame, cols: list[str], alpha: float) -> pd.DataFrame:
    """EMA-згладжування, щоб музика не «стрибала». alpha ближче до 0 дає плавніший результат."""
    out = df.copy()
    out[cols] = df[cols].ewm(alpha=alpha, adjust=False).mean()
    return out


def load_timeline(cfg: dict, fps: float) -> dict | None:
    """Дати кадрів з файлу (рядок i = дата кадру i), напр. data/sources/ndvi_dates.txt."""
    tl = cfg.get("timeline")
    if not tl:
        return None
    lines = (ROOT / tl["dates_file"]).read_text(encoding="utf-8").splitlines()
    dates = [datetime.strptime(s.strip(), tl.get("format", "%b %d, %Y")).date() for s in lines if s.strip()]
    return {"dates": dates, "fps": fps}


def auto_keyframes(timeline: dict, every: str) -> list[dict]:
    """Ключові кадри з дат: 'monthly' — 1-ше число кожного місяця, 'quarterly' — січ/квіт/лип/жовт."""
    months = {"monthly": range(1, 13), "quarterly": (1, 4, 7, 10)}[every]
    out, seen = [], set()
    for i, d in enumerate(timeline["dates"]):
        key = (d.year, d.month)
        if d.month in months and key not in seen:
            seen.add(key)
            out.append({"label": d.strftime("%b %Y"), "t": round(i / timeline["fps"], 3)})
    return out


def process(video_path: str, cfg: dict, sample_fps: float, alpha: float) -> dict:
    extractors = [EXTRACTORS[name] for name in cfg["extractors"]]
    names = [n for feats, _ in extractors for n in feats]
    fps = video_info(video_path).fps
    timeline = load_timeline(cfg, fps)
    end_t = cfg.get("end_t")
    if timeline and end_t is None:  # кадри після останньої дати — стоп-кадр, не рахуємо
        end_t = (len(timeline["dates"]) - 1) / fps

    rows, state = [], {"cfg": cfg}
    for t, frame, mask in iter_frames(video_path, sample_fps, crop=cfg["crop"], exclude=cfg["exclude"]):
        if end_t is not None and t > end_t + 1e-6:
            break
        row = {"t": round(t, 3)}
        for _, fn in extractors:
            row.update(fn(frame, mask, state))
        rows.append(row)
    if not rows:
        raise RuntimeError("Жодного кадру не прочитано")

    raw = pd.DataFrame(rows)
    df = smooth(raw, names, alpha)
    df[names] = df[names].round(4)

    # Ключові кадри (роки тощо): метрики беремо БЕЗ згладжування, з найближчого семплу
    keyframes = []
    kf_cfg = cfg["keyframes"]
    if isinstance(kf_cfg, str):  # "monthly" / "quarterly" — з дат таймлайну
        kf_cfg = auto_keyframes(timeline, kf_cfg) if timeline else []
    for kf in kf_cfg:
        i = int((raw["t"] - kf["t"]).abs().idxmin())
        metrics = {k: round(float(raw.at[i, k]), 4) for k in names}
        keyframes.append({"label": str(kf["label"]), "t": kf["t"], "metrics": metrics})

    return {
        "schema_version": SCHEMA_VERSION,
        "video_id": cfg["id"],
        "source_fps": round(fps, 3),
        "sample_fps": sample_fps,
        "duration_s": round(rows[-1]["t"] + 1 / sample_fps, 3),
        "features": names,
        "keyframes": keyframes,
        # дата кадру: start + round(t * days_per_second) днів (для UI та озвучки)
        "timeline": {
            "start": timeline["dates"][0].isoformat(),
            "end": timeline["dates"][-1].isoformat(),
            "days_per_second": fps,
        } if timeline else None,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "frames": df.to_dict(orient="records"),
    }


def run(video_id: str, video: str | None = None, sample_fps: float | None = None, alpha: float = 0.3) -> dict:
    cfg = get_video(video_id)
    path = video or str(raw_path(video_id))
    result = process(path, cfg, sample_fps or cfg["sample_fps"], alpha)
    out = features_path(video_id)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, ensure_ascii=False))
    print(f"✓ {video_id}: {len(result['frames'])} семплів, {len(result['keyframes'])} ключових кадрів → {out.relative_to(ROOT)}")
    for kf in result["keyframes"]:
        short = ", ".join(f"{k}={v:.3f}" for k, v in kf["metrics"].items() if k in ("green", "built", "water", "brightness", "ndvi_mean", "snow_share"))
        print(f"   {kf['label']:>6} @ {kf['t']:5.2f}s  {short}")
    return result


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("id", help="ідентифікатор відео з data/catalog.json")
    p.add_argument("--video", help="шлях до відео (за замовчуванням data/raw/<id>.mp4)")
    p.add_argument("--sample-fps", type=float, help="семплів на секунду (за замовчуванням з каталогу)")
    p.add_argument("--alpha", type=float, default=0.3, help="коефіцієнт EMA-згладжування (0..1)")
    a = p.parse_args()
    run(a.id, a.video, a.sample_fps, a.alpha)


if __name__ == "__main__":
    main()
