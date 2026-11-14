"""NDVI: перевод кольору пікселя в індекс рослинності за колірною шкалою NASA SVS 5544.

Джерело: https://svs.gsfc.nasa.gov/5544/ (Near Real-Time NDVI, SNPP VIIRS), рівнопроміжна
проекція (equirectangular), тож широта/довгота пікселя рахуються лінійно.
Шкала: data/sources/ndvi_colorbar.png, «Low → High» БЕЗ чисел, тому NDVI тут —
ВІДНОСНИЙ індекс 0..1 (0 = низ шкали: пустеля/тундра, 1 = верх: густий ліс).

Конфіг відео (data/catalog.json) має містити:
    "geo": {"lon": [захід, схід], "lat": [північ, південь]}  — межі ОБРІЗАНОГО (crop) кадру.
"""
from __future__ import annotations

from collections import deque

import cv2
import numpy as np

from .catalog import DATA

COLORBAR = DATA / "sources" / "ndvi_colorbar.png"
CB_X, CB_Y = (104, 797), (110, 140)   # внутрішня частина смуги шкали (без тіні по краях)
MAX_LAB_DIST = 14.0                    # далі від шкали → не рослинність (океан, озера, змішані пікселі)
Q = 4                                  # крок квантування кольору для таблиці пошуку

NDVI_FEATURES = [
    "ndvi_mean",        # середній NDVI по суші (без снігу)
    "green_share",      # частка суші з NDVI > 0.6 (густа рослинність)
    "bare_share",       # частка суші з NDVI < 0.25 (пустеля, тундра, оголений ґрунт)
    "snow_share",       # частка снігу/льоду серед суші
    "ndvi_spread",      # розкид NDVI: однорідно (0) ↔ плямами (1)
    "green_front_lat",  # «фронт зелені»: найпівнічніша широта, де середній NDVI ≥ 0.5 (0 = південь кадру, 1 = північ)
    "ndvi_centroid_x",  # де більше зелені: 0 = захід, 1 = схід
    "green_up_rate",    # швидкість зміни ndvi_mean за ~місяць: 0.5 = без змін, >0.5 весна, <0.5 осінь
    "zone_north",       # середній NDVI, широта ≥ 50° (бореальні ліси, тундра)
    "zone_east",        # 25–50°, схід від 100° з.д. (ліси сходу США/Канади)
    "zone_west",        # 25–50°, захід від 100° з.д. (прерії, гори, пустелі)
    "zone_south",       # < 25° (Мексика, Центральна Америка)
]

_lut = None


def _build_lut():
    """Для кожного квантованого кольору BGR: (NDVI 0..1, відстань до шкали в Lab)."""
    cb = cv2.imread(str(COLORBAR))
    if cb is None:
        raise FileNotFoundError(f"Немає шкали {COLORBAR}")
    strip = cb[CB_Y[0]:CB_Y[1], CB_X[0]:CB_X[1]].astype(np.float32).mean(axis=0)  # (N, 3) BGR
    ramp_lab = cv2.cvtColor(strip.reshape(1, -1, 3) / 255.0, cv2.COLOR_BGR2Lab).reshape(-1, 3)
    values = np.linspace(0.0, 1.0, len(ramp_lab))

    levels = np.arange(0, 256, Q, dtype=np.float32) + Q / 2
    grid = np.stack(np.meshgrid(levels, levels, levels, indexing="ij"), axis=-1).reshape(-1, 3)
    grid_lab = cv2.cvtColor(grid.reshape(1, -1, 3) / 255.0, cv2.COLOR_BGR2Lab).reshape(-1, 3)

    ndvi = np.empty(len(grid_lab), np.float32)
    dist = np.empty(len(grid_lab), np.float32)
    step = 4096
    for s in range(0, len(grid_lab), step):  # шматками, щоб не з'їсти пам'ять
        d = np.linalg.norm(grid_lab[s:s + step, None, :] - ramp_lab[None, :, :], axis=2)
        k = d.argmin(axis=1)
        ndvi[s:s + step] = values[k]
        dist[s:s + step] = d[np.arange(len(k)), k]
    n = 256 // Q
    return ndvi.reshape(n, n, n), dist.reshape(n, n, n)


def ndvi_map(frame_bgr: np.ndarray):
    """→ (ndvi 0..1, valid: рослинність за шкалою, snow: сніг/лід)."""
    global _lut
    if _lut is None:
        _lut = _build_lut()
    lut_ndvi, lut_dist = _lut
    q = (frame_bgr // Q).astype(np.intp)
    ndvi = lut_ndvi[q[..., 0], q[..., 1], q[..., 2]]
    dist = lut_dist[q[..., 0], q[..., 1], q[..., 2]]
    snow = frame_bgr.min(axis=2) > 240
    valid = (dist < MAX_LAB_DIST) & ~snow
    return ndvi, valid, snow


def _geo_grid(shape, geo):
    h, w = shape
    (lon_w, lon_e), (lat_n, lat_s) = geo["lon"], geo["lat"]
    lon = np.linspace(lon_w, lon_e, w, dtype=np.float32)[None, :].repeat(h, 0)
    lat = np.linspace(lat_n, lat_s, h, dtype=np.float32)[:, None].repeat(w, 1)
    return lat, lon


def compute_ndvi(frame_bgr: np.ndarray, mask: np.ndarray, state: dict) -> dict:
    geo = state["cfg"]["geo"]
    if state.get("geo_shape") != frame_bgr.shape[:2]:
        state["geo_shape"] = frame_bgr.shape[:2]
        state["lat"], state["lon"] = _geo_grid(frame_bgr.shape[:2], geo)
        state["ndvi_hist"] = deque(maxlen=10)
    lat, lon = state["lat"], state["lon"]

    ndvi, valid, snow = ndvi_map(frame_bgr)
    valid &= mask
    snow &= mask
    v = ndvi[valid]
    n = max(v.size, 1)

    def zone_mean(sel):
        z = ndvi[valid & sel]
        return float(z.mean()) if z.size > 50 else 0.0

    # фронт зелені: середній NDVI по кожному рядку (широті)
    row_cnt = valid.sum(axis=1)
    row_mean = np.where(row_cnt > 20, (ndvi * valid).sum(axis=1) / np.maximum(row_cnt, 1), np.nan)
    lat_rows = lat[:, 0]
    green_rows = np.where(row_mean >= 0.5)[0]
    front = float(lat_rows[green_rows].max()) if green_rows.size else geo["lat"][1]
    lat_n, lat_s = geo["lat"]
    front_norm = (front - lat_s) / (lat_n - lat_s)

    weights = ndvi * valid
    lon_w, lon_e = geo["lon"]
    centroid = float((weights * lon).sum() / max(weights.sum(), 1e-6))

    mean = float(v.mean()) if v.size else 0.0
    hist = state["ndvi_hist"]
    hist.append(mean)
    if len(hist) == hist.maxlen:   # ≈ місяць при sample_fps=10 (3 дні на семпл)
        half = hist.maxlen // 2
        delta = np.mean(list(hist)[half:]) - np.mean(list(hist)[:half])
    else:
        delta = 0.0

    return {
        "ndvi_mean": mean,
        "green_share": float((v > 0.6).sum() / n),
        "bare_share": float((v < 0.25).sum() / n),
        "snow_share": float(snow.sum() / max(snow.sum() + valid.sum(), 1)),
        "ndvi_spread": float(np.clip(v.std() * 3, 0, 1)) if v.size else 0.0,
        "green_front_lat": float(np.clip(front_norm, 0, 1)),
        "ndvi_centroid_x": float(np.clip((centroid - lon_w) / (lon_e - lon_w), 0, 1)),
        "green_up_rate": float(np.clip(0.5 + delta * 7, 0, 1)),
        "zone_north": zone_mean(lat >= 50),
        "zone_east": zone_mean((lat >= 25) & (lat < 50) & (lon >= -100)),
        "zone_west": zone_mean((lat >= 25) & (lat < 50) & (lon < -100)),
        "zone_south": zone_mean(lat < 25),
    }
