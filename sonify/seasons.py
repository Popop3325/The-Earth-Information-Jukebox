"""Композитор «Сезони» (пресет "seasons") — ЄДИНА озвучка проєкту NDVI.

Зібрано з саунд-дизайну команди (docs/sound-design.md) і результатів тесту асоціацій
(frontend/lab/sound-test.html):
  зима       → хуртовина «Свист у щілинах»              (white_frac)
  весна      → дуже легкий теплий вітер + трохи птахів + КАПЕЛЬ (швидкість танення снігу)
  літо       → теплий вітер (запис) + птахи
  осінь      → сухий вітер + дерев'яні клацання          (green_up_rate < 0.5)
  гола земля → вітер ТИХІШЕ («майже тиша»)
  зелень     → КОЛОКОЛЬЧИКИ: більше зелені → більше дзвонів на такт і вище
  фон        → акорд сезону + дрон (тоніка D взимку ↔ F влітку)
  3-й шар    → тиха тепла флейта октавою нижче (напрям фрази = напрям змін); тембр — у frontend/player.js

Сітка: 72 BPM, 4/4, темп сталий. Гама: пентатоніка D F G A C. Жодної випадковості:
однаковий стан даних → однаковий звук.
Час у партитурі — час ВІДЕО; playback_rate (0.25) уповільнює відео, сітка 72 BPM — у реальному часі.
"""
from __future__ import annotations

PENTA = [0, 3, 5, 7, 10]            # D F G A C від D
NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
D4 = 62


def midi_to_name(m: int) -> str:
    return f"{NOTE_NAMES[m % 12]}{m // 12 - 1}"


def penta_note(degree: int, base_midi: int = D4) -> str:
    """Ступінь пентатоніки (0 = D) → назва ноти; 5 = D наступної октави."""
    octave, step = divmod(degree, len(PENTA))
    return midi_to_name(base_midi + 12 * octave + PENTA[step])


def nrm(v: float, lo: float, hi: float) -> float:
    """v → 0..1 у межах [lo, hi]; якщо lo > hi — шкала перевернута."""
    return min(max((v - lo) / (hi - lo if hi != lo else 1e-9), 0.0), 1.0)


def lerp(a: float, b: float, x: float) -> float:
    return a + (b - a) * x


def euclid(k: int, n: int = 8) -> list[int]:
    """k ударів рівномірно на n позиціях: ритм, а не хаос."""
    return sorted({i * n // k for i in range(k)}) if k > 0 else []


class Gate:
    """Поріг з гістерезисом: вмикається вище on, вимикається нижче off — без «мерехтіння» біля межі."""

    def __init__(self, on: float, off: float):
        self.on_at, self.off_at, self.state = on, off, False

    def __call__(self, v: float) -> bool:
        self.state = v >= self.on_at if not self.state else v >= self.off_at
        return self.state


def compose(features: dict, preset: dict, features_at) -> dict:
    frames, names = features["frames"], features["features"]
    duration = features["duration_s"]
    P = preset
    rate = P.get("playback_rate", 1.0)
    spb = 60.0 / P["tempo_bpm"] * rate            # секунди ВІДЕО на долю
    beats_total = int(duration / spb)
    A, B, CH, DR, WD, WV = P["air"], P["birds"], P["chimes"], P["drips"], P["wood"], P["wind"]

    # ---------- похідні величини для кожного кадру ----------
    # Танення: наскільки зменшився сніг за ~місяць (melt_lag семплів тому → зараз)
    lag = DR["melt_lag"]
    for i, f in enumerate(frames):
        f["_melt"] = max(0.0, frames[max(i - lag, 0)]["white_frac"] - f["white_frac"])

    winter = lambda f: nrm(f["white_frac"], *A["winter_range"])          # 0 — без снігу … 1 — зима
    spring = lambda f: nrm(f["green_up_rate"], *A["spring_range"])       # зелень росте
    autumn = lambda f: nrm(f["green_up_rate"], *A["autumn_range"])       # зелень спадає
    bare_quiet = lambda f: 1 - A["bare_quieter"] * nrm(f["earth_frac"], *A["bare_range"])
    green_n = lambda f: nrm(f["green_frac"], *P["tonic_range"])

    def curve(fn):
        return [[f["t"], round(fn(f), 4)] for f in frames]

    layers = [
        # ЗИМА: хуртовина (frontend/winds.js → варіант howl)
        {"id": "air_winter", "synth": {"type": "air", "variant": A["winter_variant"]},
         "gain": curve(lambda f: A["winter_gain"] * winter(f)),
         "params": {"intensity": curve(lambda f: nrm(f["white_frac"], *A["intensity_range"]))}},
        # ВЕСНА/ЛІТО: теплий вітер (запис). Навесні дуже легкий, влітку помірний, восени згасає.
        {"id": "air_warm", "sample": A["warm_sample"], "loop": True, "loop_trim": 0.1,
         "gain": curve(lambda f: (1 - winter(f)) * bare_quiet(f) * (1 - autumn(f))
                       * lerp(A["warm_gain_summer"], A["warm_gain_spring"], spring(f)))},
        # ОСІНЬ: сухий вітер (варіант classic, слабка сила)
        {"id": "air_dry", "synth": {"type": "air", "variant": A["autumn_variant"]},
         "gain": curve(lambda f: (1 - winter(f)) * bare_quiet(f) * autumn(f) * A["dry_gain"]),
         "params": {"intensity": curve(lambda f: A["dry_intensity"])}},
        # ПТАХИ: стільки, скільки зелені (навесні трохи, влітку більше), не взимку
        {"id": "birds", "sample": B["sample"], "loop": True, "loop_trim": 0.1,
         "gain": curve(lambda f: (1 - winter(f)) * lerp(*B["gain"], nrm(f["green_frac"], *B["green_range"])))},
        # Дрон на тоніці сезону з обертонами. Кросфейд D ↔ F.
        {"id": "drone_D", "synth": {"type": "drone", "notes": P["drone"]["D"]},
         "gain": curve(lambda f: P["drone"]["gain"] * (1 - green_n(f)))},
        {"id": "drone_F", "synth": {"type": "drone", "notes": P["drone"]["F"]},
         "gain": curve(lambda f: P["drone"]["gain"] * green_n(f))},
    ]

    events: list[dict] = []
    hyst = P["hysteresis"]
    chime_gate = Gate(CH["min_green"] + hyst, CH["min_green"] - hyst)
    summer_gate = Gate(P["season_split"] + hyst, P["season_split"] - hyst)
    phrase: list[int] = []
    wind_busy_until = -1.0

    for beat in range(beats_total):
        t = round(beat * spb, 4)
        bar, pos = divmod(beat, 4)
        f = features_at(frames, names + ["_melt"], t)
        g = f["green_frac"]
        lvl = nrm(f["ndvi_mean"], *CH["ndvi_range"])
        summer = summer_gate(g)

        if pos == 0:
            # ---------- ФОН: акорд сезону раз на 2 такти ----------
            if bar % 2 == 0:
                events.append({"t": t, "voice": "pad", "instrument": "pad",
                               "notes": P["pad_chords"]["summer" if summer else "winter"],
                               "dur": round(8 * spb * 1.1, 4), "vel": P["pad_gain"]})

            # ---------- КОЛОКОЛЬЧИКИ = ЗЕЛЕНЬ: кількість дзвонів на такт і висота ← зелень ----------
            if chime_gate(g):
                k = round(lerp(*CH["per_bar"], nrm(g, CH["min_green"], CH["max_green"])))
                base = round(lerp(*CH["base_degree"], lvl))
                for j, i in enumerate(euclid(k)):
                    events.append({
                        "t": round(t + i * spb / 2, 4), "voice": "chimes", "instrument": "windchime",
                        "notes": [penta_note(base + CH["pattern"][j % len(CH["pattern"])])],
                        "vel": round(lerp(*CH["vel"], lvl), 3),
                        "ring": round(lerp(*CH["ring"], lvl), 2),
                        "bright": round(lerp(*CH["bright"], green_n(f)), 3),
                        "dur": 0.1,
                    })

            # ---------- КАПЕЛЬ: кількість крапель ← швидкість танення снігу ----------
            k = round(lerp(*DR["per_bar"], nrm(f["_melt"], *DR["melt_range"])))
            for j, i in enumerate(euclid(k)):
                events.append({
                    "t": round(t + (i + 0.25) * spb / 2, 4), "voice": "drips", "instrument": "drip",
                    "notes": [penta_note(DR["base_degree"] + DR["pattern"][j % len(DR["pattern"])])],
                    "vel": DR["vel"], "dur": 0.12,
                })

            # ---------- ДЕРЕВО (осінь): сухі клацання на слабких вісімках ----------
            k = round(lerp(*WD["per_bar"], (1 - winter(f)) * autumn(f) * nrm(f["earth_frac"], *WD["earth_range"])))
            for i in euclid(k):
                events.append({"t": round(t + (i + 0.5) * spb / 2, 4), "voice": "wood", "instrument": "wood",
                               "notes": ["A3"], "dur": 0.05, "vel": WD["vel"]})

        # ---------- ДУХОВИЙ ГОЛОС (тихий 3-й шар): напрям фрази = напрям змін ----------
        rising = f["green_up_rate"]
        direction = 1 if rising > WV["glide_up"] else -1 if rising < WV["glide_down"] else 0
        if pos == 0 and bar % WV["phrase_every_bars"] == 0 and not phrase:
            n = round(lerp(*WV["phrase_notes"], lvl))
            start = round(lerp(*WV["start_degree"], lvl))
            if direction == 0:
                up = list(range(start, start + (n + 1) // 2))
                phrase = up + up[-2::-1][: n - len(up)]
            else:
                phrase = [start + direction * i for i in range(n)]
            phrase = [min(max(d, 0), 9) for d in phrase]
        if phrase and t >= wind_busy_until - 1e-6:
            deg = phrase.pop(0)
            note_beats = max(0.5, round(lerp(*WV["note_beats"], lvl) * 2) / 2)
            base = D4 if summer else D4 - 12
            events.append({
                "t": t, "voice": "wind", "instrument": "wind_voice",
                "notes": [penta_note(deg, base)],
                "glide_from": penta_note(deg - direction, base) if direction else None,
                "dur": round(note_beats * spb * 0.95, 4),
                "vel": WV["vel"], "timbre": round(green_n(f), 3),
            })
            wind_busy_until = t + note_beats * spb

    for f in frames:
        f.pop("_melt", None)
    events.sort(key=lambda e: e["t"])

    # Пороги для панелі «Що зараз звучить» (пояснення = логіка)
    legend = {
        "winter_range": A["winter_range"], "spring_range": A["spring_range"], "autumn_range": A["autumn_range"],
        "chimes_min": CH["min_green"], "chimes_max": CH["max_green"], "chimes_per_bar": CH["per_bar"],
        "season_split": P["season_split"], "melt_range": DR["melt_range"], "melt_lag": lag,
        "drips_per_bar": DR["per_bar"], "bare_range": A["bare_range"], "birds_range": B["green_range"],
    }
    return {"layers": layers, "events": events, "tempo_bpm": P["tempo_bpm"], "playback_rate": rate, "legend": legend}
