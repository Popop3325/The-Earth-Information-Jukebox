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
| `auto_ranges` | пороги звуку автоматично з min/max даних регіону (`sonify/auto.py`); ручні `preset_overrides` мають пріоритет | `true` для континентів |

**Регіони зараз** (усі з одного відео `ndvi_global.mp4`):
- `ndvi_world`: уся суша без Антарктиди й Гренландії, зважено площею, ручні пороги звуку;
- `ndvi_north_america`: ручні пороги (на ній налаштовували звук), без зважування;
- `ndvi_south_america`, `ndvi_eurasia`, `ndvi_africa`, `ndvi_australia`: зважено площею, **автокалібрування порогів** (`auto_ranges`). Межа Африка/Євразія проходить по Червоному морю (сходинками через `exclude`).
- `ndvi_europe` (lon −10…40, lat 72…37) і `ndvi_asia` (lon 40…180, lat 78…−11, без Східної Африки): окремі регіони для гри. Порахувати: `python -m pipeline.run ndvi_europe` і `python -m pipeline.run ndvi_asia`.
- У грі (`/`) показано лише Whole Earth, North America, Europe, Asia: у південній півкулі й тропіках грудень і червень звучать майже однаково.

Порахувати всі: `venv/bin/python -m pipeline.run_all` (~30 с).

**Як порахувати `crop` для іншого материка:** проекція рівнопроміжна, тому `x = (lon + 180) / 360 × 4096`, `y = (90 − lat) / 180 × 2048`.
