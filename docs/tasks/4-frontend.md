# №4: Frontend

**Твої файли:** `frontend/index.html`, `frontend/app.js`, `frontend/style.css`, **`frontend/player.js`**, `frontend/sounds/`
**Не чіпай:** `frontend/game/` (№5). Він використовує твій `player.js`, тож інтерфейс `ScorePlayer` змінюй лише за домовленістю з №5.

## Контекст
- HTML/JS **без збірки**, Tone.js з CDN. Сервер: `.venv/bin/uvicorn backend.main:app --reload --reload-exclude '.venv/*'`, http://127.0.0.1:8000.
- Одне відео: NDVI Північної Америки. Відео глобальне, регіон показується через CSS `object-view-box` за `crop` з `/api/videos` (Chrome/Edge).
- API: `/api/videos` (`crop`, `local_video`, `description`), `/api/score/<id>` (партитура), `/api/features/<id>` (датасет: фічі + `timeline` з датами).
- `player.js` (`ScorePlayer`) програє партитуру за `getTime()`.

## Задачі

### MVP
1. **Головний екран під одне відео:** список відео не потрібен. Великий плеєр, назва, кнопка Play, опис.
2. **Поточна дата:** показувати й озвучувати (aria-live, раз на місяць) дату кадру: `timeline.start + round(t × days_per_second)` днів.
3. **Шкала часу з мітками сезонів/років** під відео, перемотування з клавіатури (←/→ = ±1 місяць).
4. **Safari:** `object-view-box` там не працює, тож потрібна обрізка через контейнер (`overflow: hidden` + `transform: scale/translate`).

### Покращення
5. **Графік фіч наживо** під відео (canvas): `ndvi_mean`, `snow_share`, `green_front_lat` з бігунком поточного часу. Видно зв'язок «дані → звук».
6. **Мікшер шарів:** вимкнути/увімкнути птахів, вітер, дзвони, голоси, щоб слухач почув кожну фічу окремо.
7. **Стерео** (`pan` у партитурі, коли №2 додасть) і **швидкість** (0.25×–1×).
8. **Доступність:** усе з клавіатури, VoiceOver (Cmd+F5), `audio_description` з `/api/videos`.
9. **Англійська мова** з перемикачем EN/UK.

### Фінал
10. Блок «How it works»: схема «відео → NDVI → датасет → партитура → звук».

## Промпт для ШІ
> Я №4 (frontend) у проєкті Earth Information Jukebox. Прочитай `README.md`, `docs/architecture.md`, `docs/tasks/4-frontend.md`, `backend/main.py`, `shared/schema/score.schema.json`, `shared/schema/features.schema.json` і все у `frontend/` (крім `game/`). Чистий HTML/CSS/JS, ES-модулі, Tone.js з CDN, без npm. Не змінюй публічні методи `ScorePlayer` без попередження. Почни із задач 1–2.
