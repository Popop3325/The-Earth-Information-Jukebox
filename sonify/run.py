"""CLI: data/features/<id>.json → data/scores/<id>.json (для перевірки й офлайн-рендеру).

Backend генерує партитуру «на льоту» сам; цей скрипт потрібен, щоб подивитися результат.

    python -m sonify.run cancun_landcover
    python -m sonify.run cancun_landcover --preset default
"""
from __future__ import annotations

import argparse
import json
from collections import Counter

from pipeline.catalog import DATA, features_path, get_video

from .score import build_score


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("id")
    p.add_argument("--preset", help="назва пресету з sonify/presets.json (за замовчуванням з каталогу)")
    a = p.parse_args()

    features = json.loads(features_path(a.id).read_text(encoding="utf-8"))
    score = build_score(features, a.preset or get_video(a.id)["preset"])
    out = DATA / "scores" / f"{a.id}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(score, ensure_ascii=False, indent=1))

    print(f"✓ {out.relative_to(DATA.parent)}  preset={score['preset']}  {score['duration_s']}s")
    print("  шари:", ", ".join(f"{l['id']} ({l['gain'][0][1]}→{l['gain'][-1][1]})" for l in score["layers"]) or "—")
    print("  події:", dict(Counter(e["voice"] for e in score["events"])))
    print("  лад:", dict(Counter(e["mode"] for e in score["events"])))


if __name__ == "__main__":
    main()
