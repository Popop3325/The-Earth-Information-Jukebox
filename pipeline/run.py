"""CLI: відео → data/features/<id>.json

Приклад:
    python -m pipeline.run data/raw/night_lights.mp4 --id night_lights --sample-fps 5
    python -m pipeline.run video.mp4 --id x --crop 0 0 1920 980   # обрізати легенду знизу
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from .features import FEATURE_NAMES, compute_features
from .frames import iter_frames, video_info

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "data" / "features"
SCHEMA_VERSION = 1


def smooth(df: pd.DataFrame, alpha: float) -> pd.DataFrame:
    """EMA-згладжування, щоб музика не «стрибала». alpha ближче до 0 дає плавніший результат."""
    out = df.copy()
    out[FEATURE_NAMES] = df[FEATURE_NAMES].ewm(alpha=alpha, adjust=False).mean()
    return out


def process(path: str, video_id: str, sample_fps: float, crop, alpha: float) -> dict:
    info = video_info(path)
    rows, prev = [], None
    for t, frame in iter_frames(path, sample_fps=sample_fps, crop=crop):
        feats, prev = compute_features(frame, prev)
        rows.append({"t": round(t, 3), **feats})
    if not rows:
        raise RuntimeError("Жодного кадру не прочитано")
    df = smooth(pd.DataFrame(rows), alpha)
    df[FEATURE_NAMES] = df[FEATURE_NAMES].round(4)
    return {
        "schema_version": SCHEMA_VERSION,
        "video_id": video_id,
        "source_fps": round(info.fps, 3),
        "sample_fps": sample_fps,
        "duration_s": round(info.duration_s, 3),
        "features": FEATURE_NAMES,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "frames": df.to_dict(orient="records"),
    }


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("video")
    p.add_argument("--id", required=True, help="ідентифікатор відео (як у data/catalog.json)")
    p.add_argument("--sample-fps", type=float, default=5.0)
    p.add_argument("--crop", type=int, nargs=4, metavar=("X", "Y", "W", "H"))
    p.add_argument("--alpha", type=float, default=0.3, help="коефіцієнт EMA-згладжування (0..1)")
    a = p.parse_args()

    result = process(a.video, a.id, a.sample_fps, tuple(a.crop) if a.crop else None, a.alpha)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"{a.id}.json"
    out.write_text(json.dumps(result, ensure_ascii=False))
    print(f"✓ {len(result['frames'])} семплів → {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
