"""Static build of the game for GitHub Pages (no server needed).

The game normally talks to the FastAPI backend (/api/...). Here we call the same
backend functions once and save their answers as plain files, so the site can be
served by any static host:

    api/videos                  ← GET /api/videos
    api/features/<id>           ← GET /api/features/<id>
    api/score/<id>              ← GET /api/score/<id>
    media/<video>.mp4           ← the NASA video (data/raw/)
    static/...                  ← frontend/
    index.html

The frontend uses relative URLs ("api/videos", "static/...", "media/..."),
so the same code works on the local server and on GitHub Pages.

Usage (from the repository root, after computing the features):

    python -m tools.build_pages              # build into build/pages/
    python -m tools.build_pages --publish    # build and force-push to the gh-pages branch
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
from pathlib import Path

from backend.main import get_features, get_score, list_videos
from pipeline.catalog import features_path, raw_path

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"
OUT = ROOT / "build" / "pages"

# Regions shown in the game (frontend/neuro/main.js → REGIONS).
GAME_REGIONS = ["ndvi_world", "ndvi_north_america", "ndvi_europe", "ndvi_asia"]


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def build() -> None:
    missing = [r for r in GAME_REGIONS if not features_path(r).exists()]
    if missing:
        raise SystemExit(f"No computed features for {missing}. Run: python -m pipeline.run_all")

    if OUT.exists():
        shutil.rmtree(OUT)
    shutil.copytree(FRONTEND, OUT / "static", ignore=shutil.ignore_patterns(".DS_Store"))
    shutil.copy2(FRONTEND / "index.html", OUT / "index.html")
    (OUT / ".nojekyll").write_text("")  # serve files as they are, no Jekyll processing

    videos = [v for v in list_videos() if v["id"] in GAME_REGIONS]
    write_json(OUT / "api" / "videos", videos)

    media = set()
    for v in videos:
        write_json(OUT / "api" / "features" / v["id"], get_features(v["id"]))
        write_json(OUT / "api" / "score" / v["id"], get_score(v["id"]))
        if v["has_local_video"]:
            media.add(raw_path(v["id"]))
    for src in media:
        (OUT / "media").mkdir(exist_ok=True)
        shutil.copy2(src, OUT / "media" / src.name)

    size = sum(f.stat().st_size for f in OUT.rglob("*") if f.is_file()) / 1e6
    print(f"Built {OUT.relative_to(ROOT)}: {len(videos)} regions, {size:.0f} MB")


def publish() -> None:
    """Force-push build/pages as a single commit to the gh-pages branch of origin."""
    remote = subprocess.check_output(["git", "remote", "get-url", "origin"], cwd=ROOT, text=True).strip()
    git = lambda *a: subprocess.run(["git", *a], cwd=OUT, check=True)  # noqa: E731
    git("init", "-q", "-b", "gh-pages")
    git("add", "-A")
    git("commit", "-q", "-m", "Deploy static site")
    git("push", "-f", remote, "gh-pages")
    shutil.rmtree(OUT / ".git")
    print("Published to the gh-pages branch.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--publish", action="store_true", help="force-push the build to the gh-pages branch")
    args = ap.parse_args()
    build()
    if args.publish:
        publish()
