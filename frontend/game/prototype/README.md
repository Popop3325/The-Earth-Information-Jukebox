# Прототип гри «Леса и Нейроны» (оригінал)

Перший прототип гри, збережений **як є** для довідки. Змінено лише шляхи до звуків (`../../sounds/*.m4a`) і відео (`/media/cancun_landcover.mp4`).

Відкрити: запустіть сервер і перейдіть на http://127.0.0.1:8000/static/game/prototype/index.html. Відео `data/raw/cancun_landcover.mp4` має лежати локально.

**Що з цього вже перенесено в основний проєкт:**
- `prepare.py` → `pipeline/landcover.py` (класи зелень/забудова/вода/хмари) + `keyframes` у `data/catalog.json`
- `data.js` → `GET /api/quiz/cancun_landcover` і `GET /api/score/cancun_landcover`
- звуки (WAV, 42 МБ) → `frontend/sounds/*.m4a` (1.8 МБ)

**Що переносить №5 (гейміфікація):** див. `docs/tasks/5-gamification.md`.
