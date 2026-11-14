"""Фічі одного кадру. Усі значення нормалізовані приблизно до 0..1.

Щоб додати нову фічу:
1) допишіть її в compute_features();
2) додайте назву в shared/schema/features.schema.json (опис);
3) за потреби використайте її в shared/mapping.json.
"""
from __future__ import annotations

import cv2
import numpy as np

FEATURE_NAMES = [
    "brightness",     # середня яскравість (V у HSV)
    "contrast",       # стандартне відхилення яскравості
    "saturation",     # середня насиченість
    "warmth",         # частка «теплих» відтінків (червоні/жовті) серед насичених пікселів
    "edge_density",   # частка пікселів-країв (Canny): деталізованість кадру
    "active_ratio",   # частка дуже яскравих пікселів (вогні, блискавки)
    "motion",         # середній рух відносно попереднього кадру (optical flow)
    "centroid_x",     # горизонтальний «центр мас» яскравості: для стерео-панорами
]


def compute_features(frame_bgr: np.ndarray, prev_gray: np.ndarray | None) -> tuple[dict, np.ndarray]:
    hsv = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2HSV)
    h, s, v = hsv[..., 0].astype(np.float32), hsv[..., 1] / 255.0, hsv[..., 2] / 255.0
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)

    # «Теплота»: OpenCV hue 0..180; теплі ≈ 0–35 і 160–180
    colored = s > 0.25
    warm = ((h < 35) | (h > 160)) & colored
    warmth = float(warm.sum() / max(colored.sum(), 1))

    edges = cv2.Canny(gray, 80, 160)

    # Рух: Farneback optical flow між сусідніми семплами
    motion = 0.0
    if prev_gray is not None and prev_gray.shape == gray.shape:
        flow = cv2.calcOpticalFlowFarneback(prev_gray, gray, None, 0.5, 3, 15, 3, 5, 1.2, 0)
        mag = np.linalg.norm(flow, axis=2)
        motion = float(np.clip(mag.mean() / 5.0, 0, 1))  # 5 px ≈ «максимальний» рух

    col_weight = v.sum(axis=0)
    centroid_x = float((col_weight * np.linspace(0, 1, v.shape[1])).sum() / max(col_weight.sum(), 1e-6))

    feats = {
        "brightness": float(v.mean()),
        "contrast": float(np.clip(v.std() * 2, 0, 1)),
        "saturation": float(s.mean()),
        "warmth": warmth,
        "edge_density": float(np.clip((edges > 0).mean() * 5, 0, 1)),
        "active_ratio": float(np.clip((v > 0.85).mean() * 10, 0, 1)),
        "motion": motion,
        "centroid_x": centroid_x,
    }
    return feats, gray
