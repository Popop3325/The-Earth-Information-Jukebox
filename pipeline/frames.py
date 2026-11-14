"""Витяг кадрів з відео з фіксованою частотою за часом (а не «кожен N-й кадр»)."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterator

import cv2
import numpy as np


@dataclass
class VideoInfo:
    fps: float
    frame_count: int
    duration_s: float
    width: int
    height: int


def video_info(path: str) -> VideoInfo:
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise FileNotFoundError(f"Не вдалося відкрити відео: {path}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.release()
    return VideoInfo(fps=fps, frame_count=n, duration_s=n / fps, width=w, height=h)


def iter_frames(
    path: str,
    sample_fps: float = 5.0,
    resize_width: int = 480,
    crop: tuple[int, int, int, int] | None = None,
) -> Iterator[tuple[float, np.ndarray]]:
    """Повертає (час_у_секундах, кадр BGR) приблизно sample_fps разів на секунду.

    crop = (x, y, w, h) у пікселях ОРИГІНАЛЬНОГО відео: щоб прибрати легенду чи підписи.
    """
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise FileNotFoundError(f"Не вдалося відкрити відео: {path}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    step = 1.0 / sample_fps
    next_t = 0.0
    idx = 0
    while True:
        ok = cap.grab()  # grab без декодування — швидко пропускаємо зайві кадри
        if not ok:
            break
        t = idx / fps
        idx += 1
        if t + 1e-9 < next_t:
            continue
        ok, frame = cap.retrieve()
        if not ok:
            break
        next_t += step
        if crop:
            x, y, w, h = crop
            frame = frame[y : y + h, x : x + w]
        if resize_width and frame.shape[1] > resize_width:
            scale = resize_width / frame.shape[1]
            frame = cv2.resize(frame, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        yield t, frame
    cap.release()
