# Earth Information Jukebox 🌍🎵

Проєкт для [NASA Space Apps Challenge 2026: The Earth Information Jukebox](https://www.spaceappschallenge.org/2026/challenges/the-earth-information-jukebox/).

**Чуємо, як дихає рослинність Північної Америки.** Беремо візуалізацію NASA [Near Real-Time NDVI (SVS 5544)](https://svs.gsfc.nasa.gov/5544/): 900 днів супутникових даних VIIRS. Кожен кадр переводимо в індекс рослинності, з нього отримуємо датасет, а з датасету звук: весна, літо, осінь і зима звучать по-різному. Плюс гра, у якій зміни треба **почути**.

Поки працюємо з **одним відео й одним материком**. Інші материки — це той самий код з іншим `crop`.

## Як це працює

```
NDVI-відео (SVS 5544) → pipeline/ (колір → NDVI, маски, зони) → датасет → sonify/ → партитура (score)
                                                                                     │
                                        backend/ (FastAPI) ──────────────────────────┘
                                                │
                       frontend/ (гра: index.html + neuro/)
                       └── frontend/player.js програє партитуру (Tone.js)
```

Деталі: [docs/architecture.md](docs/architecture.md). Формати: [features.schema.json](shared/schema/features.schema.json), [score.schema.json](shared/schema/score.schema.json).

## Структура

| Папка | Що там | Хто |
|---|---|---|
| `pipeline/` | кадри, NDVI за колірною шкалою, фічі, ML | №1 |
| `backend/` | FastAPI | №1 |
| `sonify/` | алгоритм сонифікації, пресет `vegetation` | №2 |
| `data/` | каталог, дати кадрів, шкала NDVI; саме відео не в git | №3 |
| `frontend/` | гра (`index.html`, `neuro/`), `player.js`, звуки | №4, №5 |
| `shared/` | схеми даних | усі |
| `docs/` | архітектура, план команди, задачі | усі |

## Запуск

Потрібен Python 3.12+ (перевірено на 3.14).

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Скачати відео NASA (58 МБ; краще взяти копію в капітана, бо NASA оновлює файл на сайті):

```bash
curl -L -o data/raw/ndvi_global.mp4 https://svs.gsfc.nasa.gov/vis/a000000/a005500/a005544/nrt_ndvi_equi_2048p30.mp4
```

Порахувати датасет (~6 с):

```bash
.venv/bin/python -m pipeline.run ndvi_north_america
```

Запустити сервер:

```bash
.venv/bin/uvicorn backend.main:app --reload --reload-exclude '.venv/*'
```

- Гра: http://127.0.0.1:8000

## Робота в команді

- **Хто що робить, таймлайн і промпти для ШІ:** [docs/TEAM.md](docs/TEAM.md), задачі кожного в [docs/tasks/](docs/tasks/)
- **Як працювати з git:** [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)
