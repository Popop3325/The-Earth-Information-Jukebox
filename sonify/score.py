"""Алгоритм сонифікації: фічі → партитура (score).

Партитура (формат: shared/schema/score.schema.json) містить:
  layers    — зациклені семпли (птахи, вітер…) і криву гучності [[t, gain], ...];
  events    — нотні події {t, voice, instrument, notes, dur, vel};
  keyframes — ключові кадри (роки) з метриками, для гри.
Усі часи — у секундах ВІДЕО. Браузер просто програє це синхронно з video.currentTime.
"""
from __future__ import annotations

import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PRESETS_PATH = Path(__file__).resolve().parent / "presets.json"
SCHEMA_VERSION = 1

SCALES = {
    "major": [0, 2, 4, 5, 7, 9, 11],
    "minor": [0, 2, 3, 5, 7, 8, 10],
}
NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


# ---------- музичні утиліти ----------
def name_to_midi(name: str) -> int:
    pitch, octave = name[:-1], int(name[-1])
    return 12 * (octave + 1) + NOTE_NAMES.index(pitch)


def midi_to_name(midi: int) -> str:
    return f"{NOTE_NAMES[midi % 12]}{midi // 12 - 1}"


def degree_to_midi(root_midi: int, degree: int, scale: list[int]) -> int:
    octave, step = divmod(degree, len(scale))
    return root_midi + 12 * octave + scale[step]


# ---------- робота з фічами ----------
def load_presets() -> dict:
    data = json.loads(PRESETS_PATH.read_text(encoding="utf-8"))
    return {k: v for k, v in data.items() if not k.startswith("_")}


def features_at(frames: list[dict], names: list[str], t: float) -> dict:
    """Лінійна інтерполяція між двома сусідніми семплами."""
    if t <= frames[0]["t"]:
        return {k: frames[0][k] for k in names}
    for a, b in zip(frames, frames[1:]):
        if a["t"] <= t <= b["t"]:
            x = (t - a["t"]) / max(b["t"] - a["t"], 1e-9)
            return {k: a[k] + (b[k] - a[k]) * x for k in names}
    return {k: frames[-1][k] for k in names}


def norm(spec: dict, feats: dict) -> float:
    """Значення фічі → 0..1 за range, з опційним invert."""
    lo, hi = spec.get("range", [0, 1])
    v = feats.get(spec["feature"], 0.0)
    x = min(max((v - lo) / max(hi - lo, 1e-9), 0.0), 1.0)
    return 1.0 - x if spec.get("invert") else x


def lerp(pair, x: float) -> float:
    return pair[0] + (pair[1] - pair[0]) * x


# ---------- головна функція ----------
def build_score(features: dict, preset_name: str = "default", seed: int = 42) -> dict:
    presets = load_presets()
    preset = presets.get(preset_name) or presets["default"]
    frames, names = features["frames"], features["features"]
    duration = features["duration_s"]
    rng = random.Random(seed)  # детерміновано: однакові дані → однакова музика

    # 1) Шари семплів: гучність у кожній точці семплу
    layers = []
    for spec in preset.get("layers", []):
        if spec["feature"] not in names:
            continue
        points = [[f["t"], round(lerp(spec["gain"], norm(spec, f)), 3)] for f in frames]
        layers.append({"id": spec["id"], "sample": spec["sample"], "loop": True, "gain": points})

    # 2) Нотні події на сітці долей
    spb = 60.0 / preset["tempo_bpm"]
    root = name_to_midi(preset["root"])
    mode_spec = preset["mode"]
    mode, pending, pending_beats = mode_spec["below"], None, 0
    events = []
    beat = 0.0
    step = min(v["every_beats"] for v in preset["voices"]) if preset["voices"] else 1
    while beat * spb < duration:
        t = beat * spb
        feats = features_at(frames, names, t)

        # лад змінюємо лише на початку такту і з гістерезисом
        if beat % 4 == 0 and mode_spec["feature"] in feats:
            wanted = mode_spec["above"] if feats[mode_spec["feature"]] > mode_spec["threshold"] else mode_spec["below"]
            if wanted == mode:
                pending, pending_beats = None, 0
            elif wanted == pending:
                pending_beats += 4
                if pending_beats >= mode_spec.get("hold_beats", 8):
                    mode, pending, pending_beats = wanted, None, 0
            else:
                pending, pending_beats = wanted, 4
        scale = SCALES[mode]

        for voice in preset["voices"]:
            if abs((beat / voice["every_beats"]) - round(beat / voice["every_beats"])) > 1e-6:
                continue
            if any(s["feature"] not in feats for s in (voice["pitch"], voice["velocity"])):
                continue
            prob = voice.get("probability")
            if prob and prob["feature"] in feats and rng.random() > lerp(prob["value"], norm(prob, feats)):
                continue
            degree = round(lerp(voice["pitch"]["degrees"], norm(voice["pitch"], feats)))
            if voice.get("chord"):
                notes = [degree_to_midi(root, degree + i, scale) for i in (0, 2, 4)]
            else:
                notes = [degree_to_midi(root, degree, scale)]
            events.append({
                "t": round(t, 3),
                "voice": voice["id"],
                "instrument": voice["instrument"],
                "notes": [midi_to_name(n) for n in notes],
                "dur": round(voice["every_beats"] * spb * (1.0 if voice.get("chord") else 0.8), 3),
                "vel": round(lerp(voice["velocity"]["value"], norm(voice["velocity"], feats)), 3),
                "mode": mode,
            })
        beat += step

    return {
        "schema_version": SCHEMA_VERSION,
        "video_id": features["video_id"],
        "preset": preset_name if preset_name in presets else "default",
        "duration_s": duration,
        "tempo_bpm": preset["tempo_bpm"],
        "layers": layers,
        "events": events,
        "keyframes": features.get("keyframes", []),
        "is_sample": bool(features.get("is_sample")),
    }
