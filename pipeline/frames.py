"""Витяг кадрів з відео з фіксованою частотою за часом (а не «кожен N-й кадр»)."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterator, Sequence

import cv2
import numpy as np

Rect = Sequence[int]  # (x, y, w, h) у пікселях ОРИГІНАЛЬНОГО відео


@dataclass
class VideoInfo:
    fps: float
    frame_count: int
    width: int
    height: int


def video_info(path: str) -> VideoInfo:
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise FileNotFoundError(f"Не вдалося відкрити відео: {path}")
    info = VideoInfo(
        fps=cap.get(cv2.CAP_PROP_FPS) or 30.0,
        frame_count=int(cap.get(cv2.CAP_PROP_FRAME_COUNT)),
        width=int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
        height=int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
    )
    cap.release()
    return info


def iter_frames(
    path: str,
    sample_fps: float = 5.0,
    resize_width: int = 480,
    crop: Rect | None = None,
    exclude: Sequence[Rect] = (),
) -> Iterator[tuple[float, np.ndarray, np.ndarray]]:
    """Повертає (час_у_секундах, кадр BGR, маска) приблизно sample_fps разів на секунду.

    crop    — прямокутник з даними (прибрати чорні смуги, легенду знизу тощо);
    exclude — прямокутники, які НЕ рахуємо (підпис року, логотип, назва місця).
    маска   — bool-масив розміру кадру: True = піксель враховується.
    Усі координати — у пікселях оригінального відео.
    """
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise FileNotFoundError(f"Не вдалося відкрити відео: {path}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    step = 1.0 / sample_fps
    next_t, idx = 0.0, 0
    base_mask = None
    while True:
        if not cap.grab():  # grab без декодування — швидко пропускаємо зайві кадри
            break
        t = idx / fps
        idx += 1
        if t + 1e-9 < next_t:
            continue
        ok, frame = cap.retrieve()
        if not ok:
            break
        next_t += step

        if base_mask is None:
            base_mask = _build_mask(frame.shape[:2], crop, exclude, resize_width)
        if crop:
            x, y, w, h = crop
            frame = frame[y : y + h, x : x + w]
        if resize_width and frame.shape[1] > resize_width:
            frame = cv2.resize(frame, base_mask.shape[::-1], interpolation=cv2.INTER_AREA)
        yield t, frame, base_mask
    cap.release()


def _build_mask(shape, crop, exclude, resize_width) -> np.ndarray:
    mask = np.ones(shape, dtype=np.uint8)
    for x, y, w, h in exclude:
        mask[y : y + h, x : x + w] = 0
    if crop:
        x, y, w, h = crop
        mask = mask[y : y + h, x : x + w]
    if resize_width and mask.shape[1] > resize_width:
        scale = resize_width / mask.shape[1]
        size = (resize_width, max(1, round(mask.shape[0] * scale)))
        mask = cv2.resize(mask, size, interpolation=cv2.INTER_NEAREST)
    return mask.astype(bool)
