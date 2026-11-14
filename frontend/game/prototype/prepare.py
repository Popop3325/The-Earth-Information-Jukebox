"""
prepare.py: готовит данные для страницы из видео.

Что делает:
  1. Берёт секунды лет из таблицы (YEARS). Это секунды в video.mp4.
  2. Разбивает видео на кадры (уменьшенные, для скорости).
  3. Для каждого года считает долю зелени (растительности) и застройки.
  4. Между каждой парой соседних лет берёт SAMPLES кадров покадрово.
     Это шаги соннификации.
  5. Пишет data.js. Страница читает его.

Правила подсчёта (прототип):
  зелень   — пиксель зелёный (правило «зелёный = птицы»);
  застройка — пиксель не зелёный, не вода и не облако (светлые городские участки);
  вода     — синий пиксель, не считается ни зелёным, ни застройкой;
  облака   — почти белые пиксели, исключаются из расчёта.

Запуск:  python3 prepare.py
Нужно:   ffmpeg, ffprobe, pip install numpy pillow
"""

import glob
import json
import os
import shutil
import subprocess

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
VIDEO = os.path.join(HERE, "video.mp4")
TMP = os.path.join(HERE, "_frames")
OUT = os.path.join(HERE, "data.js")

# Годы и секунды в видео (из таблицы)
YEARS = [(1987, 0.00), (1993, 0.54), (1999, 1.14), (2005, 1.75), (2011, 2.38), (2018, 3.06)]
SAMPLES = 8              # кадров между двумя годами (= шагов соннификации)
FRAME_WIDTH = 390        # уменьшаем кадр, доли от этого почти не меняются


def video_fps():
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=r_frame_rate", "-of", "csv=p=0", VIDEO],
        capture_output=True, text=True, check=True,
    ).stdout.strip().rstrip(",")
    num, den = out.split("/")
    return float(num) / float(den)


def extract_frames():
    if os.path.isdir(TMP):
        shutil.rmtree(TMP)
    os.makedirs(TMP)
    subprocess.run(
        ["ffmpeg", "-v", "error", "-i", VIDEO,
         "-vf", f"scale={FRAME_WIDTH}:-2", "-start_number", "0",
         os.path.join(TMP, "f%04d.png")],
        check=True,
    )
    return len(glob.glob(os.path.join(TMP, "f*.png")))


def analyze(path):
    """Возвращает (доля зелени, доля застройки) от видимой части кадра."""
    a = np.asarray(Image.open(path).convert("RGB")).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    bright = (r + g + b) / 3
    cloud = np.minimum(np.minimum(r, g), b) > 200
    water = (b > g + 15) & (b > r + 25)
    green = (g > r + 3) & (g > b + 3) & ~cloud
    built = (~green) & (~water) & (~cloud) & (bright > 90)
    visible = max((~cloud).sum(), 1)
    return float(green.sum() / visible), float(built.sum() / visible)


def main():
    fps = video_fps()
    n = extract_frames()

    def stats_at(t):
        idx = min(n - 1, int(round(t * fps)))
        return analyze(os.path.join(TMP, f"f{idx:04d}.png"))

    years = []
    for year, t in YEARS:
        gr, bu = stats_at(t)
        years.append({"year": year, "t": t, "green": round(gr, 4), "built": round(bu, 4)})

    intervals = []
    for i in range(len(YEARS) - 1):
        (y0, t0), (y1, t1) = YEARS[i], YEARS[i + 1]
        steps = []
        for k in range(SAMPLES):
            t = t0 + (t1 - t0) * k / (SAMPLES - 1)
            gr, bu = stats_at(t)
            steps.append({"green": round(gr, 4), "built": round(bu, 4)})
        intervals.append({"from": y0, "to": y1, "t0": t0, "t1": t1, "steps": steps})

    print("Год    секунда   зелень    застройка")
    for y in years:
        print(f"{y['year']}   {y['t']:5.2f}s   {y['green']*100:5.1f}%    {y['built']*100:5.1f}%")
    print()
    print("Видео:", round(fps, 3), "кадров/с,", n, "кадров")

    clip = {"video": "video.mp4", "fps": round(fps, 3), "years": years, "intervals": intervals}
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write("// Создано prepare.py. Не редактировать вручную.\n")
        fh.write("window.CLIP = ")
        json.dump(clip, fh, ensure_ascii=False, indent=2)
        fh.write(";\n")
    shutil.rmtree(TMP)
    print("Записан", OUT)


if __name__ == "__main__":
    main()
