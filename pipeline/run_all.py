"""Порахувати фічі для всіх відео з каталогу, для яких є data/raw/<id>.mp4.

    python -m pipeline.run_all
"""
from __future__ import annotations

from .catalog import load_catalog, raw_path
from .run import run


def main() -> None:
    done = skipped = 0
    for v in load_catalog():
        if raw_path(v["id"]).exists():
            run(v["id"])
            done += 1
        else:
            skipped += 1
    print(f"Готово: {done}, пропущено (немає відео в data/raw/): {skipped}")


if __name__ == "__main__":
    main()
