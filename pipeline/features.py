"""Загальні («basic») фічі одного кадру. Усі значення нормалізовані приблизно до 0..1.

Щоб додати нову фічу:
1) допишіть її в compute_basic() і в BASIC_FEATURES (з коментарем, що вона означає);
2) повідомте сонифікацію (№2): вона може використати фічу в sonify/presets.json.
"""
from __future__ import annotations

import cv2
import numpy as np

BASIC_FEATURES = [
    "brightness",     # середня яскравість (V у HSV)
    "contrast",       # стандартне відхилення яскравості
    "saturation",     # середня насиченість
    "warmth",         # частка «теплих» відтінків (червоні/жовті) серед насичених пікселів
    "edge_density",   # частка пікселів-країв (Canny): деталізованість кадру
    "active_ratio",   # частка дуже яскравих пікселів (вогні, блискавки)
    "motion",         # середній рух відносно попереднього кадру (optical flow)
    "centroid_x",     # горизонтальний «центр мас» яскравості: для стерео-панорами
]


def compute_basic(frame_bgr: np.ndarray, mask: np.ndarray, state: dict) -> dict:
    """state — словник між кадрами (тут зберігається попередній кадр для руху)."""
    hsv = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2HSV)
    h = hsv[..., 0].astype(np.float32)
    s = hsv[..., 1] / 255.0
    v = hsv[..., 2] / 255.0
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    m = mask
    n = max(int(m.sum()), 1)

    # «Теплота»: OpenCV hue 0..180; теплі ≈ 0–35 і 160–180
    colored = (s > 0.25) & m
    warm = ((h < 35) | (h > 160)) & colored
    warmth = float(warm.sum() / max(colored.sum(), 1))

    edges = cv2.Canny(gray, 80, 160) > 0

    motion = 0.0
    prev = state.get("prev_gray")
    if prev is not None and prev.shape == gray.shape:
        flow = cv2.calcOpticalFlowFarneback(prev, gray, None, 0.5, 3, 15, 3, 5, 1.2, 0)
        mag = np.linalg.norm(flow, axis=2)
        motion = float(np.clip(mag[m].mean() / 5.0, 0, 1))  # 5 px ≈ «максимальний» рух
    state["prev_gray"] = gray

    vm = np.where(m, v, 0)
    col_weight = vm.sum(axis=0)
    centroid_x = float((col_weight * np.linspace(0, 1, v.shape[1])).sum() / max(col_weight.sum(), 1e-6))

    return {
        "brightness": float(v[m].mean()),
        "contrast": float(np.clip(v[m].std() * 2, 0, 1)),
        "saturation": float(s[m].mean()),
        "warmth": warmth,
        "edge_density": float(np.clip(edges[m].sum() / n * 5, 0, 1)),
        "active_ratio": float(np.clip((v[m] > 0.85).sum() / n * 10, 0, 1)),
        "motion": motion,
        "centroid_x": centroid_x,
    }
