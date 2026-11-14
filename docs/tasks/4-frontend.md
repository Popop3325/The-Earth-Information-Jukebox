# №4: Frontend

**Твої файли:** `frontend/index.html`, `frontend/app.js`, `frontend/style.css`, **`frontend/player.js`**, `frontend/sounds/`
**Не чіпай:** `frontend/game/` (№5). Він використовує твій `player.js`, тож інтерфейс `ScorePlayer` змінюй лише за домовленістю з №5.

## Контекст
- Простий HTML/JS **без збірки** (без npm), Tone.js підключено з CDN.
- Сервер: `.venv/bin/uvicorn backend.main:app --reload`, сторінка: http://127.0.0.1:8000, гра: http://127.0.0.1:8000/game.
- API (`backend/main.py`):
  - `GET /api/videos`: список (`id`, `title`, `has_features`, `has_local_video`, `has_quiz`, `preset`, `description`);
  - `GET /api/score/<id>?preset=...`: партитура (`shared/schema/score.schema.json`);
  - `GET /api/presets`: назви пресетів;
  - `/media/<id>.mp4`: локальне відео; `/static/sounds/<file>`: звуки.
- `frontend/player.js` (`ScorePlayer`) програє партитуру за `getTime()` (зазвичай `video.currentTime`): шари семплів + синтез нот.

## Задачі

### MVP (до 12-ї години)
1. **Вигляд джукбокса:** картки відео з прев'ю, назвою, позначками «є гра» / «демо-дані». Великий плеєр.
2. **Перевірити й виправити `player.js`** на реальних даних: немає клацань при зміні гучності, перемотування не «вистрілює» купою нот, `dispose()` не залишає звук.
3. **Опис під відео:** показувати `description.short` і `description.science` з `/api/videos` (заповнює №3).

### Покращення (12–30 год)
4. **Візуалізація звуку:** смужки гучності шарів (`player.layerGain(id)`) і «спалахи» нот (через `player.onTick`), щоб було видно зв'язок «картинка → звук».
5. **«Розтягування» коротких відео:** для таймлапсів ~4 с додай повзунок швидкості (`video.playbackRate`). Плеєр уже рахує тривалість нот з урахуванням rate. Узгодь з №2 (параметр `stretch`).
6. **Доступність:** усе працює з клавіатури, видно фокус; окремий `aria-live`-регіон для подій («Грає: Night lights, мінорний лад»), але **не** для статусу, що оновлюється 25 разів на секунду; `description.audio_description` для скрінрідера. Перевір з VoiceOver (Cmd+F5).
7. **Мобільна версія** (375px) і **англійська мова** інтерфейсу (подача англійською), з перемикачем EN/UK.

### Фінал
8. Сторінка або блок «How it works»: схема «відео → фічі → партитура → звук» з текстами від №2/№3.

## Готово, коли
- можна обрати відео, натиснути Play, і звук іде синхронно, а пауза й перемотування працюють
- без помилок у консолі; все працює з клавіатури

## Промпт для ШІ
> Я №4 (frontend) у проєкті Earth Information Jukebox. Прочитай `README.md`, `docs/architecture.md`, `docs/TEAM.md`, `docs/tasks/4-frontend.md`, `backend/main.py`, `shared/schema/score.schema.json` і все у `frontend/` (крім `game/`). Фронтенд без збірки (чистий HTML/CSS/JS, ES-модулі, Tone.js з CDN), npm не використовуй. Не змінюй публічні методи `ScorePlayer` без попередження. Почни із задачі 2, потім 1.
