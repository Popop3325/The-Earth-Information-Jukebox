# Earth Information Jukebox 🌍🎵

Проєкт для [NASA Space Apps Challenge 2026: The Earth Information Jukebox](https://www.spaceappschallenge.org/2026/challenges/the-earth-information-jukebox/).

Вебзастосунок, що перетворює візуалізації NASA Earth Information Center (EIC) на звук (сонифікацію).

## Як це працює

```
[SVS відео] → pipeline/ (Python, OpenCV) → data/features/<id>.json ─┐
                                                                    ├→ backend/ (FastAPI) → frontend/ (<video> + Tone.js)
                                 shared/mapping.json ───────────────┘
```

1. **pipeline/**: офлайн, один раз на відео. Бере кадри з частотою `sample_fps` (наприклад, 5 кадрів/с), зменшує їх, рахує фічі (яскравість, «теплота» кольорів, рух…), згладжує й зберігає JSON-«партитуру».
2. **backend/**: віддає список відео та JSON з фічами, а також роздає фронтенд.
3. **frontend/**: програє відео й у реальному часі синтезує звук у браузері за фічами та правилами з `shared/mapping.json`.

Формат даних між частинами описано в [shared/schema/features.schema.json](shared/schema/features.schema.json). Приклад: [shared/examples/sample_features.json](shared/examples/sample_features.json).

## Структура

| Папка | Що там | Хто |
|---|---|---|
| `pipeline/` | витяг кадрів, фічі, ML | ML/backend |
| `backend/` | FastAPI | ML/backend |
| `frontend/` | HTML/JS + Tone.js, без збірки | фронтенд, звук |
| `shared/` | схема фіч і маппінг «фіча → звук» | усі |
| `data/` | каталог відео (`catalog.json`); самі відео не в git | дані |
| `docs/` | архітектура, правила роботи з git | усі |

## Запуск

Потрібен Python 3.12+ (перевірено на 3.14).

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Обробити відео (спершу покладіть файл у `data/raw/`, див. [data/README.md](data/README.md)):

```bash
python -m pipeline.run data/raw/night_lights.mp4 --id night_lights --sample-fps 5
```

Запустити сервер (API + фронтенд):

```bash
uvicorn backend.main:app --reload
```

Відкрити http://127.0.0.1:8000

## Робота в команді

Див. [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md).
