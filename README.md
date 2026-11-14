# Earth Information Jukebox 🌍🎵

Проєкт для [NASA Space Apps Challenge 2026: The Earth Information Jukebox](https://www.spaceappschallenge.org/2026/challenges/the-earth-information-jukebox/).

Вебзастосунок, що перетворює супутникові візуалізації NASA на звук (сонифікацію), плюс гра, в якій зміни Землі треба **почути**.

## Як це працює

```
відео → pipeline/ (Python, OpenCV, ML) → фічі → sonify/ (Python) → партитура (score)
                                                                        │
                                       backend/ (FastAPI) ──────────────┘
                                                │
                       frontend/ (джукбокс) і frontend/game/ (гра)
                       └── frontend/player.js програє партитуру (Tone.js)
```

1. **pipeline/** аналізує кадри (`sample_fps` на секунду) і рахує фічі: яскравість, рух, частки лісу, міста, води…
2. **sonify/** за пресетом перетворює фічі на партитуру: шари семплів (птахи, вітер) з кривою гучності і нотні події.
3. **backend/** віддає каталог, партитури (`/api/score/<id>`) і квіз для гри (`/api/quiz/<id>`).
4. **frontend/** програє партитуру синхронно з відео. Браузер нічого не вирішує, уся логіка на Python.

Деталі: [docs/architecture.md](docs/architecture.md). Формати: [features.schema.json](shared/schema/features.schema.json), [score.schema.json](shared/schema/score.schema.json).

## Структура

| Папка | Що там | Хто |
|---|---|---|
| `pipeline/` | кадри, фічі, land cover, ML | №1 |
| `backend/` | FastAPI | №1 |
| `sonify/` | алгоритм сонифікації, пресети | №2 |
| `data/` | каталог відео, описи; самі відео не в git | №3 |
| `frontend/` | джукбокс, `player.js`, звуки | №4 |
| `frontend/game/` | гра + оригінальний прототип | №5 |
| `shared/` | схеми даних | усі |
| `docs/` | архітектура, план команди, задачі | усі |

## Запуск

Потрібен Python 3.12+ (перевірено на 3.14).

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Порахувати фічі (відео має лежати в `data/raw/<id>.mp4`, див. [data/README.md](data/README.md)):

```bash
python -m pipeline.run cancun_landcover
```

Подивитися партитуру (необов'язково, сервер генерує її сам):

```bash
python -m sonify.run cancun_landcover
```

Запустити сервер:

```bash
uvicorn backend.main:app --reload
```

- Джукбокс: http://127.0.0.1:8000
- Гра: http://127.0.0.1:8000/game

## Робота в команді

- **Хто що робить, таймлайн і промпти для ШІ:** [docs/TEAM.md](docs/TEAM.md), задачі кожного в [docs/tasks/](docs/tasks/)
- **Як працювати з git:** [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)
