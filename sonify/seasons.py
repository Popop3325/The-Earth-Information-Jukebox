"""Композитор «Сезони» (пресет "seasons"): саунд-дизайн команди для NDVI.

Принципи (з дизайн-документа):
  • Сітка: 72 BPM, 4/4, темп НІКОЛИ не змінюється — динаміка лише щільністю, тембром, гучністю.
  • Гама: пентатоніка D F G A C (= ре-мінорна і фа-мажорна). Тоніка в басу: зима D (прохолодно), літо F (світло).
  • Фон: акорди лише з нот гами — Dm7, Csus2, Gsus4, Dm7 (по такту), гучність ~0.25.
  • ≤ 3 помітних потоки: ДЗВОНИ, ПОВІТРЯ, ДУХОВИЙ ГОЛОС (+ тиха підкладка/дрон нижче порогу уваги).
  • Одна змінна не керує всім одразу:
        повітря   ← earth_frac (сухість: гучність, яскравість) + white_frac (пориви, свист)
        дзвони    ← green_frac (є/нема, 1 чи 2 удари) + ndvi_mean (висота, довжина дзвону) + white_frac (скло)
        голос     ← ndvi_mean (довжина фраз, регістр, тембр) + green_up_rate (ковзання вгору/вниз)
        тоніка    ← green_frac (D ↔ F)
  • Випадковість лише всередині сітки й гами, ДЕТЕРМІНОВАНА від стану: однаковий стан → однаковий звук
    (важливо для чесних питань у грі).

Час у партитурі — це час ВІДЕО. Пресет задає playback_rate (напр. 0.25): відео грає повільніше,
а сітка 72 BPM рахується в реальному часі слухача.
"""
from __future__ import annotations

import hashlib

PENTA = [0, 3, 5, 7, 10]            # D F G A C від D
NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
D4 = 62


def midi_to_name(m: int) -> str:
    return f"{NOTE_NAMES[m % 12]}{m // 12 - 1}"


def penta_note(degree: int, base_midi: int = D4) -> str:
    """Ступінь пентатоніки (0 = D) → назва ноти; 5 = D наступної октави."""
    octave, step = divmod(degree, len(PENTA))
    return midi_to_name(base_midi + 12 * octave + PENTA[step])


def hval(*parts) -> float:
    """Детермінований «випадковий» 0..1 від стану (а не від часу)."""
    h = hashlib.md5("|".join(map(str, parts)).encode()).digest()
    return int.from_bytes(h[:4], "big") / 2**32


def nrm(v: float, lo: float, hi: float) -> float:
    return min(max((v - lo) / max(hi - lo, 1e-9), 0.0), 1.0)


def lerp(a: float, b: float, x: float) -> float:
    return a + (b - a) * x


def q(v: float, steps: int = 20) -> int:
    """Квантований стан для hval: дрібні коливання даних не змінюють «випадкове» рішення."""
    return round(v * steps)


def compose(features: dict, preset: dict, features_at) -> dict:
    frames, names = features["frames"], features["features"]
    duration = features["duration_s"]
    P = preset
    rate = P.get("playback_rate", 1.0)
    spb = 60.0 / P["tempo_bpm"] * rate            # секунди ВІДЕО на долю
    beats_total = int(duration / spb)

    air, bells, wind, tex, drone = P["air"], P["bells"], P["wind"], P["textures"], P["drone"]

    # ---------- ПОВІТРЯ (один шумовий шар з «ручками») + підкладка + дрон ----------
    def curve(fn):
        return [[f["t"], round(fn(f), 4)] for f in frames]

    earth_n = lambda f: nrm(f["earth_frac"], *air["earth_range"])
    white_n = lambda f: nrm(f["white_frac"], *air["white_range"])
    green_n = lambda f: nrm(f["green_frac"], *P["tonic_range"])

    layers = [
        {
            "id": "air", "synth": {"type": "air", "breath_period_beats": 16, "breath_depth": 0.2},
            # Формула з дизайну: 0.2 + 0.5 × (частка відкритої землі)
            "gain": curve(lambda f: air["base"] + air["earth_gain"] * earth_n(f)),
            "params": {
                # сухість і сніг відкривають фільтр: земля — середні частоти, сніг — високі
                "filter_hz": curve(lambda f: lerp(*air["filter_hz"], max(0.55 * earth_n(f), white_n(f)))),
                "gust": curve(lambda f: white_n(f)),                                   # глибина поривів
                "whistle": curve(lambda f: lerp(*air["whistle_gain"], nrm(f["white_frac"], *air["whistle_range"]))),
            },
        },
        # Дрон на тоніці сезону з чутними обертонами (телефон «добудує» бас). Кросфейд D ↔ F.
        {"id": "drone_D", "synth": {"type": "drone", "notes": drone["D"]},
         "gain": curve(lambda f: drone["gain"] * (1 - green_n(f)))},
        {"id": "drone_F", "synth": {"type": "drone", "notes": drone["F"]},
         "gain": curve(lambda f: drone["gain"] * green_n(f))},
    ]
    if "birds" in P:  # птахи — лише тихий фон у густій зелені, не головний звук
        b = P["birds"]
        layers.append({"id": "birds", "sample": b["sample"], "loop": True,
                       "gain": curve(lambda f: lerp(*b["gain"], nrm(f[b["feature"]], *b["range"])))})

    events: list[dict] = []
    phrase_left = 0           # скільки нот ще у фразі духового голосу
    wind_degree = None
    wind_busy_until = -1.0    # голос монофонічний

    for beat in range(beats_total):
        t = round(beat * spb, 4)
        bar, pos = divmod(beat, 4)
        f = features_at(frames, names, t)
        g = f["green_frac"]

        # ---------- ФОН: акорд на кожен такт ----------
        if pos == 0:
            chord = P["progression"][bar % len(P["progression"])]
            events.append({"t": t, "voice": "pad", "instrument": "pad", "notes": chord,
                           "dur": round(4 * spb * 1.15, 4), "vel": P["pad_gain"]})

        # ---------- ДЗВОНИ: лише на 1-й і 3-й долі, лише якщо зелені ≥ 20% ----------
        if pos in (0, 2) and g >= bells["min_green"]:
            strikes = 2 if g >= bells["double_green"] else 1
            if pos == 0 or strikes == 2:
                lvl = nrm(f["ndvi_mean"], *bells["ndvi_range"])
                # висота: більше зелені → вище; варіація детермінована від стану
                deg = round(lerp(*bells["degrees"], lvl)) + (1 if pos == 2 else 0)
                deg += int(hval("bell", bar % 4, pos, q(lvl)) * 2)
                ring_idx = min(int(lvl * len(bells["ring_steps"])), len(bells["ring_steps"]) - 1)
                glass = nrm(f["white_frac"], *bells["glass_range"])
                events.append({
                    "t": t, "voice": "bells", "instrument": "tuned_bell",
                    "notes": [penta_note(deg)], "vel": round(lerp(*bells["vel"], lvl), 3),
                    "ring": bells["ring_steps"][ring_idx],                       # 0.4–3 с, 5 ступенів
                    "tierce": round(lerp(*bells["tierce"], nrm(g, *P["tonic_range"])), 3),  # 1.2 зима → 1.25 літо
                    "glass": round(glass, 3),                                     # «заморожений» звон
                    "dur": bells["ring_steps"][ring_idx],
                })

        # ---------- ДУХОВИЙ ГОЛОС: фрази; довжина від NDVI; тембр і регістр від сезону ----------
        lvl = nrm(f["ndvi_mean"], *wind["ndvi_range"])
        if pos == 0 and bar % wind["phrase_every_bars"] == 0 and phrase_left == 0:
            phrase_left = round(lerp(*wind["phrase_notes"], lvl))
            wind_degree = round(lerp(*wind["start_degree"], lvl))
        if phrase_left > 0 and t >= wind_busy_until - 1e-6:
            note_beats = max(0.5, round(lerp(*wind["note_beats"], lvl) * 2) / 2)
            season = nrm(g, *P["tonic_range"])
            base = D4 - 12 if season < 0.5 else D4                               # бас-флейта ↔ кларнет
            rising = f["green_up_rate"]
            glide = 1 if rising > wind["glide_up"] else -1 if rising < wind["glide_down"] else 0
            events.append({
                "t": t, "voice": "wind", "instrument": "wind_voice",
                "notes": [penta_note(wind_degree, base)],
                "glide_from": penta_note(wind_degree - glide, base) if glide else None,
                "dur": round(note_beats * spb * 0.95, 4),
                "vel": wind["vel"], "timbre": round(season, 3),
            })
            wind_busy_until = t + note_beats * spb
            phrase_left -= 1
            step = 1 if hval("wind", bar % 8, phrase_left, q(lvl)) > 0.5 else -1
            wind_degree = min(max(wind_degree + step, 0), 7)

        # ---------- ТЕКСТУРИ (частина «повітря»): лід і сухе дерево на сітці вісімок ----------
        for half in (0, 1):
            te = round(t + half * spb / 2, 4)
            ice = tex["ice"]
            p_ice = lerp(*ice["prob"], nrm(f["white_frac"], *ice["range"]))
            if p_ice > 0 and hval("ice", bar % 4, pos, half, q(f["white_frac"])) < p_ice:
                events.append({"t": te, "voice": "ice", "instrument": "ice", "notes": ["C7"],
                               "dur": 0.03, "vel": ice["vel"]})
            wood = tex["wood"]
            if half == 1 and g < wood["mute_above_green"]:
                p_wood = lerp(*wood["prob"], nrm(f["earth_frac"], *wood["range"]))
                if p_wood > 0 and hval("wood", bar % 4, pos, q(f["earth_frac"])) < p_wood:
                    events.append({"t": te, "voice": "wood", "instrument": "wood", "notes": ["A3"],
                                   "dur": 0.05, "vel": wood["vel"]})

    events.sort(key=lambda e: e["t"])
    return {"layers": layers, "events": events, "tempo_bpm": P["tempo_bpm"], "playback_rate": rate}
