"""Автокалібрування порогів звуку під дані конкретного регіону.

Навіщо: у кожного континенту свої діапазони (в Африці немає снігу, Австралія переважно гола земля,
Амазонія зелена весь рік). Фіксовані пороги з пресету, підібрані під Північну Америку, на інших регіонах
дали б «вічне літо» або «вічну тишу». Тут пороги обчислюються з min/max даних самого регіону,
тож кожен регіон звучить на повний діапазон У МЕЖАХ ВЛАСНИХ змін.

Мінус: регіони не можна порівнювати між собою за абсолютною гучністю (Сахара й Амазонія мають
однаково «повний» діапазон). Для порівняння — ручні пороги (як у ndvi_north_america).

Увімкнення: у catalog.json регіону "auto_ranges": true. Ручні "preset_overrides" мають пріоритет.
"""
from __future__ import annotations


def _span(frames, key):
    vals = sorted(f[key] for f in frames)
    lo, hi = vals[int(len(vals) * 0.02)], vals[int(len(vals) * 0.98) - 1]   # без 2% викидів
    mid = vals[len(vals) // 2]
    return lo, mid, hi


def auto_overrides(features: dict) -> dict:
    fr = features["frames"]
    w_lo, _, w_hi = _span(fr, "white_frac")
    e_lo, e_mid, e_hi = _span(fr, "earth_frac")
    g_lo, _, g_hi = _span(fr, "green_frac")
    n_lo, _, n_hi = _span(fr, "ndvi_mean")
    u_lo, _, u_hi = _span(fr, "green_up_rate")
    gs = max(g_hi - g_lo, 0.02)
    at = lambda lo, hi, x: round(lo + (hi - lo) * x, 4)

    # Сніг: якщо його майже немає (Африка, Австралія), «зими» немає взагалі
    has_winter = w_hi > 0.04
    winter = [at(w_lo, w_hi, 0.15), at(w_lo, w_hi, 0.8)] if has_winter else [0.98, 0.99]

    # Танення снігу за місяць (як у seasons.py: різниця white_frac через melt_lag семплів)
    lag = 10
    melt = max((max(0.0, fr[max(i - lag, 0)]["white_frac"] - f["white_frac"]) for i, f in enumerate(fr)), default=0)

    up_hi, up_lo = max(u_hi - 0.5, 0.02), max(0.5 - u_lo, 0.02)
    return {
        "tonic_range": [at(g_lo, g_hi, 0.2), at(g_lo, g_hi, 0.8)],
        "season_split": at(g_lo, g_hi, 0.5),
        "air": {
            "winter_range": winter,
            "intensity_range": winter if has_winter else [0.98, 0.99],
            "bare_range": [round(e_mid, 4), round(max(e_hi, e_mid + 0.02), 4)],
            "spring_range": [round(0.5 + 0.1 * up_hi, 4), round(0.5 + 0.7 * up_hi, 4)],
            "autumn_range": [round(0.5 - 0.1 * up_lo, 4), round(0.5 - 0.7 * up_lo, 4)],
        },
        "birds": {"green_range": [at(g_lo, g_hi, 0.1), round(g_hi, 4)]},
        "chimes": {
            "min_green": at(g_lo, g_hi, 0.15),          # у найбіднішу пору колокольчики мовчать
            "max_green": round(g_hi, 4),
            "ndvi_range": [round(n_lo, 4), round(max(n_hi, n_lo + 0.02), 4)],
        },
        "drips": {"melt_range": [0.0, round(max(melt * 0.8, 0.01), 4)] if has_winter else [0.5, 1.0]},
        "wood": {"earth_range": [round(e_mid, 4), round(max(e_hi, e_mid + 0.02), 4)]},
        "_auto": {"white": [round(w_lo, 3), round(w_hi, 3)], "green": [round(g_lo, 3), round(g_hi, 3)],
                  "earth": [round(e_lo, 3), round(e_hi, 3)], "has_winter": has_winter},
    }


def region_overrides(cfg: dict, features: dict) -> dict | None:
    """Пороги для регіону: автокалібрування (якщо auto_ranges) + ручні preset_overrides поверх."""
    from .score import deep_merge
    manual = cfg.get("preset_overrides")
    if not cfg.get("auto_ranges") or features.get("is_sample"):
        return manual
    return deep_merge(auto_overrides(features), manual)
