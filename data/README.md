# Дані

- `catalog.json`: відео/регіони і налаштування обробки. **Комітимо.**
- `sources/`: шкала NDVI (`ndvi_colorbar.png`) і дати кадрів (`ndvi_dates.txt`, рядок *i* = дата кадру *i*). **Комітимо.**
- `descriptions.json`: тексти для кожного відео (`short`, `science`, `audio_description`, `how_it_sounds`). **Комітимо.**
- `raw/`: відео (`ndvi_global.mp4`). **Не комітимо.**
- `features/`: датасет від `pipeline.run`. **Не комітимо**, кожен генерує сам (~6 с).
- `scores/`, `audio/`: результати `sonify.run` і рендеру. **Не комітимо.**

## Відео

NASA SVS 5544, Near Real-Time NDVI, equirectangular, без підпису дати:

```bash
curl -L -o data/raw/ndvi_global.mp4 https://svs.gsfc.nasa.gov/vis/a000000/a005500/a005544/nrt_ndvi_equi_2048p30.mp4
```

⚠ Сторінка **оновлюється**: NASA дописує нові дні, і тоді кадрів більше, ніж дат у `sources/ndvi_dates.txt`. Щоб усі мали однакові дані, беріть копію файлу в капітана.

Перевірено для нашої версії: 4096×2048, 30 fps, 930 кадрів. Кадри 0–899 відповідають датам 27.12.2023–13.06.2026, далі стоп-кадр (pipeline його відкидає).

## Поля `catalog.json`

| Поле | Що це | Приклад |
|---|---|---|
| `id` | ідентифікатор регіону | `"ndvi_north_america"` |
| `raw_file` | файл у `raw/` (один на всі регіони) | `"ndvi_global.mp4"` |
| `extractors` | які фічі рахувати: `ndvi`, `basic` | `["ndvi"]` |
| `crop` | `[x, y, w, h]`: регіон у пікселях **оригіналу** | `[137, 205, 1320, 660]` |
| `geo` | довгота/широта меж `crop` (для зон і фронту весни) | `{"lon": [-168, -52], "lat": [72, 14]}` |
| `exclude` | `[[x, y, w, h], ...]`: зони, які не рахуємо | Гренландія |
| `timeline` | файл з датами кадрів | `{"dates_file": "data/sources/ndvi_dates.txt"}` |
| `keyframes` | `"quarterly"` / `"monthly"` або список `[{label, t}]` | `"quarterly"` |
| `preset` | пресет звуку з `sonify/presets.json` | `"vegetation"` |
| `sample_fps` | скільки кадрів на секунду аналізувати | `10` (= кожні 3 дні) |
| `quiz` | гра: `subject`, `metric`, `grows_with_metric`, `min_diff` | |
| `geo.area_weighted` | зважувати пікселі площею (cos широти); потрібно для великих регіонів | `true` для світу |
| `preset_overrides` | пороги звуку для цього регіону поверх пресету (той самий звук, інша чутливість) | див. `ndvi_world` |

**Регіони зараз:** `ndvi_north_america` і `ndvi_world` (уся суша без Антарктиди й Гренландії, зважено площею).

**Як порахувати `crop` для іншого материка:** проекція рівнопроміжна, тому `x = (lon + 180) / 360 × 4096`, `y = (90 − lat) / 180 × 2048`.
