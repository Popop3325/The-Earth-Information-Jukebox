"""Композитор «Сезони» (пресет "seasons"): саунд-дизайн команди для NDVI.

Принципи (з дизайн-документа):
  • Сітка: 72 BPM, 4/4, темп НІКОЛИ не змінюється — динаміка лише щільністю, тембром, гучністю.
  • Гама: пентатоніка D F G A C (= ре-мінорна і фа-мажорна). Тоніка в басу: зима D (прохолодно), літо F (світло).
  • Фон: акорди лише з нот гами — Dm7, Csus2, Gsus4, Dm7 (по такту), гучність ~0.25.
  • ≤ 3 помітних потоки: ДЗВОНИ, ПОВІТРЯ, ДУХОВИЙ ГОЛОС (+ тиха підкладка/дрон нижче порогу уваги).
  • Одна змінна не керує всім одразу:
        повітря   ← earth_frac (загальна гучність) + white_frac (хуртовина ↔ теплий вітер, сила хуртовини)
        дзвони    ← green_frac (є/нема, 1 чи 2 удари) + ndvi_mean (висота, довжина дзвону) + white_frac (скло)
        голос     ← ndvi_mean (довжина фраз, регістр, тембр) + green_up_rate (ковзання вгору/вниз)
        тоніка    ← green_frac (D ↔ F)
  • БЕЗ випадковості: висота, напрям мелодії й щільність ритму напряму залежать від даних,
    тож однаковий стан → однаковий звук (важливо для чесних питань у грі).

Час у партитурі — це час ВІДЕО. Пресет задає playback_rate (напр. 0.25): відео грає повільніше,
а сітка 72 BPM рахується в реальному часі слухача.
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
    return min(max((v - lo) / max(hi - lo, 1e-9), 0.0), 1.0)


def lerp(a: float, b: float, x: float) -> float:
    return a + (b - a) * x


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
    green_n = lambda f: nrm(f["green_frac"], *P["tonic_range"])
    air_total = lambda f: air["base"] + air["earth_gain"] * earth_n(f)        # формула з дизайну
    winter_share = lambda f: nrm(f["white_frac"], *air["winter_range"])     # 0 = теплий вітер … 1 = хуртовина

    layers = [
        # ПОВІТРЯ = два шари, що перетікають за часткою снігу (загальна гучність 0.2 + 0.5 × гола земля):
        #   зима — синтезована хуртовина «Свист у щілинах» (frontend/winds.js, варіант air.winter_variant),
        #          її сила (intensity) теж росте зі снігом;
        #   весна/літо — запис м'якого вітру (frontend/sounds/wind_warm.m4a).
        {
            "id": "air_winter", "synth": {"type": "air", "variant": air["winter_variant"]},
            "gain": curve(lambda f: air_total(f) * winter_share(f)),
            "params": {"intensity": curve(lambda f: nrm(f["white_frac"], *air["intensity_range"]))},
        },
        {
            "id": "air_warm", "sample": air["warm_sample"], "loop": True, "loop_trim": 0.1,
            "gain": curve(lambda f: air_total(f) * (1 - winter_share(f)) * air["warm_gain"]),
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

    class Gate:
        """Поріг з гістерезисом: вмикається вище on, вимикається нижче off — без «мерехтіння» біля межі."""
        def __init__(self, on: float, off: float):
            self.on_at, self.off_at, self.state = on, off, False

        def __call__(self, v: float) -> bool:
            self.state = v >= self.on_at if not self.state else v >= self.off_at
            return self.state

    hyst = P.get("hysteresis", 0.03)
    bells_gate = Gate(bells["min_green"] + hyst, bells["min_green"] - hyst)
    double_gate = Gate(bells["double_green"] + hyst, bells["double_green"] - hyst)
    summer_gate = Gate(P["season_split"] + hyst, P["season_split"] - hyst)   # фон: зимовий ↔ літній акорд

    phrase: list[int] = []      # ступені фрази духового голосу, що лишилось зіграти
    wind_busy_until = -1.0      # голос монофонічний

    def euclid(k: int, n: int = 8) -> set[int]:
        """k ударів рівномірно на n позиціях: ритм, а не хаос."""
        return {i * n // k for i in range(k)} if k > 0 else set()

    for beat in range(beats_total):
        t = round(beat * spb, 4)
        bar, pos = divmod(beat, 4)
        f = features_at(frames, names, t)
        g = f["green_frac"]
        lvl = nrm(f["ndvi_mean"], *bells["ndvi_range"])   # 0 = мало зелені … 1 = пік літа
        summer = summer_gate(g)

        # ---------- ФОН: ОДИН акорд сезону (зима — Dm7, літо — Fadd9), раз на 2 такти ----------
        if pos == 0 and bar % 2 == 0:
            chord = P["pad_chords"]["summer" if summer else "winter"]
            events.append({"t": t, "voice": "pad", "instrument": "pad", "notes": chord,
                           "dur": round(8 * spb * 1.1, 4), "vel": P["pad_gain"]})

        # ---------- ДЗВОНИ: висота = рівень зелені (більше зелені → вище). Жодної випадковості ----------
        if pos in (0, 2) and bells_gate(g):
            strikes = 2 if double_gate(g) else 1
            if pos == 0 or strikes == 2:
                deg = round(lerp(*bells["degrees"], lvl)) + (2 if pos == 2 else 0)  # 2-й удар — на 2 ступені вище
                ring_idx = min(int(lvl * len(bells["ring_steps"])), len(bells["ring_steps"]) - 1)
                events.append({
                    "t": t, "voice": "bells", "instrument": "tuned_bell",
                    "notes": [penta_note(deg)], "vel": round(lerp(*bells["vel"], lvl), 3),
                    "ring": bells["ring_steps"][ring_idx],
                    "tierce": round(lerp(*bells["tierce"], nrm(g, *P["tonic_range"])), 3),
                    "glass": round(nrm(f["white_frac"], *bells["glass_range"]), 3),
                    "dur": bells["ring_steps"][ring_idx],
                })

        # ---------- ДУХОВИЙ ГОЛОС: напрям фрази = напрям змін ----------
        # весна (зелень росте) → фраза йде ВГОРУ; осінь → ВНИЗ; без змін → «арка» вгору-вниз.
        # Початкова нота = рівень зелені; довжина фрази й нот = рівень зелені.
        rising = f["green_up_rate"]
        direction = 1 if rising > wind["glide_up"] else -1 if rising < wind["glide_down"] else 0
        if pos == 0 and bar % wind["phrase_every_bars"] == 0 and not phrase:
            n = round(lerp(*wind["phrase_notes"], lvl))
            start = round(lerp(*wind["start_degree"], lvl))
            if direction == 0:
                up = list(range(start, start + (n + 1) // 2))
                phrase = up + up[-2::-1][: n - len(up)]
            else:
                phrase = [start + direction * i for i in range(n)]
            phrase = [min(max(d, 0), 9) for d in phrase]
        if phrase and t >= wind_busy_until - 1e-6:
            deg = phrase.pop(0)
            note_beats = max(0.5, round(lerp(*wind["note_beats"], lvl) * 2) / 2)
            season = nrm(g, *P["tonic_range"])
            base = D4 - 12 if not summer else D4                                  # бас-флейта ↔ кларнет
            events.append({
                "t": t, "voice": "wind", "instrument": "wind_voice",
                "notes": [penta_note(deg, base)],
                "glide_from": penta_note(deg - direction, base) if direction else None,
                "dur": round(note_beats * spb * 0.95, 4),
                "vel": wind["vel"], "timbre": round(season, 3),
            })
            wind_busy_until = t + note_beats * spb

        # ---------- ТЕКСТУРИ: рівномірний ритм на 8 вісімках такту; щільність = дані ----------
        if pos == 0:
            ice, wood = tex["ice"], tex["wood"]
            k_ice = round(lerp(*ice["hits"], nrm(f["white_frac"], *ice["range"])))
            k_wood = round(lerp(*wood["hits"], nrm(f["earth_frac"], *wood["range"]))) if g < wood["mute_above_green"] else 0
            for i in sorted(euclid(k_ice)):
                events.append({"t": round(t + i * spb / 2, 4), "voice": "ice", "instrument": "ice",
                               "notes": ["C7"], "dur": 0.03, "vel": ice["vel"]})
            for i in sorted(euclid(k_wood)):
                te = round(t + (i + 0.5) * spb / 2, 4)    # на слабких вісімках, між ударами льоду
                events.append({"t": te, "voice": "wood", "instrument": "wood",
                               "notes": ["A3"], "dur": 0.05, "vel": wood["vel"]})

    events.sort(key=lambda e: e["t"])
    # Пороги для UI-панелі «що зараз звучить» (щоб пояснення збігалося з логікою)
    legend = {
        "bells_min": bells["min_green"], "bells_double": bells["double_green"],
        "season_split": P["season_split"], "glide_up": wind["glide_up"], "glide_down": wind["glide_down"],
        "ice_from": tex["ice"]["range"][0], "wood_from": tex["wood"]["range"][0],
    }
    return {"layers": layers, "events": events, "tempo_bpm": P["tempo_bpm"], "playback_rate": rate, "legend": legend}
