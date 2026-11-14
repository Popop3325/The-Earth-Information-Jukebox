# №3: Дані, рендер аудіо, деплой (Python)

**Твої файли:** `data/catalog.json`, `data/README.md`, `data/descriptions.json`, `render/` (створиш), файли деплою (`Dockerfile` тощо)
**Не чіпай:** `pipeline/`, `sonify/`, `backend/`, `frontend/` (баги повідомляй власникам)

## Контекст
Ти забезпечуєш реальні відео з правильними налаштуваннями, робиш **аудіофайли для подачі** (плейлист) і викладаєш сайт онлайн.

## Задачі

### MVP (перші 6 годин, бо від тебе залежать №1 і №2)
1. **Завантажити 2–3 відео NASA SVS** з `data/catalog.json`. Пропозиція: `night_lights`, `iss_lightning`, `sea_surface_currents`. На сторінці `svs_page` у блоці Download візьми MP4 **1080p або менше** і збережи як `data/raw/<id>.mp4`. Пряме посилання впиши в `video_url`.
2. **`crop` і `exclude`** для кожного відео: прямокутник із даними і зони, які не рахуємо (дата, легенда, логотип), у пікселях оригіналу. Як приклад дивись запис `cancun_landcover`. Перевір координати на скріншоті кадру (Preview на Mac показує їх).
3. **`keyframes`** (роки або дати ↔ секунди), якщо на відео є підписи часу. Для Канкуна вже перевірено за підписом року.
4. **Джерело Канкуна:** знайди аналогічний таймлапс на NASA (SVS, Earth Observatory, Landsat) або точне джерело і онови поле `source`.
5. Порахуй фічі й передай №1/№2 знахідки:
   ```bash
   .venv/bin/python -m pipeline.run night_lights
   ```

### Рендер аудіо (12–30 год)
6. **`render/render.py`:** score → WAV/MP3 без браузера, для плейлиста в подачі.
   - Семпли: читати `frontend/sounds/*.m4a` (або WAV-оригінали), зациклювати, множити на криву гучності (`numpy.interp`).
   - Ноти: простий синтез у numpy (синус + обвідна ADSR; для `bell` два синуси з різною частотою).
   - Змішати, нормалізувати, записати через `soundfile`. Параметр `--stretch`, щоб 4-секундний таймлапс звучав ~30 с.
   - `python -m render.render cancun_landcover --stretch 8` → `data/audio/cancun_landcover.wav`.
7. **Описи** в `data/descriptions.json` (backend уже віддає їх у `/api/videos` як `description`):
   ```json
   { "cancun_landcover": { "short": "...", "science": "...", "audio_description": "...", "how_it_sounds": "..." } }
   ```
   Пиши англійською, бо подача англійською. Факти бери зі сторінок NASA.

### Деплой (30–42 год)
8. **Деплой онлайн** (Render.com, Railway або Hugging Face Spaces, безкоштовно): `pip install -r requirements.txt`, потім `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`.
   - Відео в git не лежать: або грати їх із `video_url`, або класти стиснені версії на хостинг.
   - Фічі (`data/features/*.json`) маленькі, тож для деплою їх можна закомітити (прибрати правило з `.gitignore`).
9. Перевірити посилання з телефона й іншого комп'ютера.

## Готово, коли
- ≥ 3 відео в `data/raw/` з `crop`/`exclude`, фічі пораховані
- 3 WAV/MP3 у плейлисті, описи заповнені
- сайт відкривається за публічним посиланням

## Промпт для ШІ
> Я №3 (дані, рендер аудіо, деплой) у проєкті Earth Information Jukebox. Прочитай `README.md`, `docs/architecture.md`, `docs/TEAM.md`, `docs/tasks/3-data-render-deploy.md`, `data/README.md`, `data/catalog.json`, `shared/schema/score.schema.json`, `sonify/score.py`. Пояснюй кожну команду простими словами. Почни із задачі 1: допоможи завантажити відео і заповнити `catalog.json`.
