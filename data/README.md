# Дані

- `catalog.json`: список відео і налаштування обробки. **Комітимо.**
- `descriptions.json`: тексти для кожного відео (`short`, `science`, `audio_description`, `how_it_sounds`). **Комітимо.** Заповнює №3.
- `raw/`: завантажені відео (`<id>.mp4`). **Не комітимо.**
- `features/`: результат `pipeline.run` (`<id>.json`). **Не комітимо**, бо кожен генерує локально.
- `scores/`, `audio/`: результати `sonify.run` і рендеру. **Не комітимо.**

## Поля `catalog.json`

| Поле | Що це | Приклад |
|---|---|---|
| `id` | ідентифікатор = ім'я файлу в `raw/` | `"night_lights"` |
| `title`, `svs_page`, `source` | назва та джерело | |
| `video_url` | пряме посилання на MP4, щоб інші скачали те саме | |
| `extractors` | які фічі рахувати: `basic`, `landcover` | `["basic", "landcover"]` |
| `crop` | `[x, y, w, h]`: прямокутник із даними, у пікселях **оригінального** відео | `[232, 0, 2068, 1170]` |
| `exclude` | `[[x, y, w, h], ...]`: зони, які не рахуємо (дата, логотип, підпис) | |
| `keyframes` | `[{label, t}]`: ключові моменти (роки) і секунда у відео | `{"label": "1987", "t": 0.05}` |
| `preset` | пресет звуку з `sonify/presets.json` | `"ocean"` |
| `sample_fps` | скільки кадрів на секунду аналізувати (за замовчуванням 5) | `10` для коротких таймлапсів |
| `quiz` | налаштування гри: `subject`, `metric`, `grows_with_metric` | `{"subject": "birds", "metric": "built", "grows_with_metric": false}` |

## Як отримати відео

1. Відкрийте сторінку `svs_page` з `catalog.json` (джерело: [EIC gallery](https://svs.gsfc.nasa.gov/gallery/earth-information-center/)).
2. У блоці **Download** оберіть MP4 з роздільністю 1080p або нижче. 4K не потрібне.
3. Збережіть файл як `data/raw/<id>.mp4` і впишіть пряме посилання в `video_url`.
4. Порахуйте фічі: `.venv/bin/python -m pipeline.run <id>`

Відео `cancun_landcover.mp4` (з прототипу гри) візьміть у капітана команди.
