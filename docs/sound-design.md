# Sound design (single sound preset: `seasons`)

Built from two team design documents (“Master grid” and “Three colours”) and an **association test** we ran with listeners (a temporary page, since removed).
Code: [sonify/seasons.py](../sonify/seasons.py) (the score), [frontend/player.js](../frontend/player.js) and [frontend/winds.js](../frontend/winds.js) (the sound). Parameters: `sonify/presets.json` → `seasons`.

## What sounds like what

| Phenomenon (data) | Sound | How it is computed |
|---|---|---|
| ❄ **Winter** — snow (`white_frac`) | a blizzard, “whistling through the cracks” | 10–40 % snow → from silence to a full blizzard; the howl also grows with snow |
| 🌱 **Spring** — vegetation growing (`green_up_rate` > 0.52) | a **very light** warm wind + a few birds + **dripping water** | drips: 0–6 per bar ← how much snow disappeared over the last month |
| ☀ **Summer** | warm wind (recording) + birds | birds ← share of green 30–85 % |
| 🍂 **Autumn** — vegetation declining (`green_up_rate` < 0.48) | dry wind + wooden clicks | clicks: 0–3 per bar ← autumn × bare ground, only when there is no snow |
| 🟫 **Bare ground** (`earth_frac`) | the wind gets **quieter** (“almost silence”) | 15–35 % bare ground → warm winds down by up to 50 % |
| 🌿 **Green land** (`green_frac`, `ndvi_mean`) | **wind chimes** | silent below 20 % green; then 1–8 chimes per bar; higher and brighter with NDVI |
| 🎵 Winter ↔ summer | chord + drone | D minor (tonic D) ↔ F major (tonic F), switching at 50 % green |
| 🎶 Direction of change | a quiet warm flute (one octave lower, smooth legato) | spring → phrases rise, autumn → phrases fall |
| 🔔 The human | a singing-bowl Bell, apart from the chimes | rung by the player (Space); nature answers with the sound of that period |

## Grid and rules

- **72 BPM, 4/4, constant tempo.** D–F–G–A–C pentatonic. The video plays at 0.25× (about 2 minutes, about 25 days per bar).
- **No randomness.** The rhythm of chimes, drips and wood is evenly spread (“Euclidean”); the data sets only how dense it is. The same data always gives the same music.
- **Thresholds with hysteresis** (±0.03), so sounds don't flicker around a boundary.
- **Per-region calibration** ([sonify/auto.py](../sonify/auto.py)): each region is scaled to its own range of values, so Europe and the whole Earth both use the full range of sound.
- Slow wind modulations (< 0.2 Hz), avoiding 4 Hz and 15–300 Hz flutter, which is unpleasant to listen to for a long time.
- The **Sound** menu in the game header lets you turn layers (wind, chimes, birds, music) up, down or off and hear each one separately.

## Sounds

- Synthesised in the browser with Tone.js: blizzard, dry wind, wind chimes, drips, wood, flute, chord, drone, Bell.
- Recordings: `wind_warm.m4a` (warm wind) and `birds.m4a` (birds, volume normalised), both from freesound.org under Creative Commons. See [frontend/sounds/CREDITS.md](../frontend/sounds/CREDITS.md).
- The wind variants are defined in `frontend/winds.js`.

## Decisions along the way

- **Melodic voice.** A quiet wind-instrument voice stays as the third layer, together with the wind and the chimes.
- **Its timbre.** The first version (flute ↔ clarinet with a glide into every note) sounded shrill, “like a mosquito”. We compared several replacements and chose a warm flute one octave lower with smooth legato.

## Open ideas

- **Chimes:** this is the first synthesised version; it could be replaced with a recorded sample.
- **Stereo “breathing” of the hemispheres** (Northern on the left, Southern on the right): the seasons are opposite, so it would be audible — needs a second region from the same video playing at the same time.
