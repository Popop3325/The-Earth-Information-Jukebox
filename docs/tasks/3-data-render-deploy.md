# №3: Дані, рендер аудіо, деплой (Python)

**Твої файли:** `data/catalog.json`, `data/README.md`, `data/descriptions.json`, `render/` (створиш), файли деплою
**Не чіпай:** `pipeline/`, `sonify/`, `backend/`, `frontend/` (баги повідомляй власникам)

## Контекст
Працюємо з одним відео: NASA SVS 5544 (NDVI), регіон Північна Америка. Ти відповідаєш за дані й опис, **аудіофайли для подачі** і **сайт онлайн**.

## Задачі

### Дані й тексти
1. **Перевірити регіон:** відкрий кадр відео, переконайся, що `crop` охоплює всю Північну Америку (Аляска, Центральна Америка), а `exclude` прибирає Гренландію. Формули `x/y` є в `data/README.md`.
2. **Підготувати другий материк** на майбутнє (лише запис у каталозі, без коду): Південна Америка або Європа, `crop` + `geo`. №1 перевірить фічі.
3. **Описи** в `data/descriptions.json` (backend віддає їх у `/api/videos`), англійською:
   ```json
   { "ndvi_north_america": { "short": "...", "science": "що таке NDVI, звідки дані (VIIRS)", "audio_description": "що видно по сезонах", "how_it_sounds": "..." } }
   ```
   Факти бери зі сторінки https://svs.gsfc.nasa.gov/5544/ та NASA Earth Observatory (що таке NDVI).

### Рендер аудіо
4. **`render/render.py`:** партитура → WAV/MP3 без браузера (плейлист для подачі).
   - Семпли: `frontend/sounds/*.m4a`, зациклити, помножити на криву гучності (`numpy.interp`).
   - Ноти: простий синтез у numpy (синус + обвідна ADSR).
   - Змішати, нормалізувати, записати через `soundfile`. Параметр `--stretch`.
   - Окремі треки «2024», «2025», «весна 2024 vs весна 2026».

### Деплой
5. **Онлайн** (Render.com, Railway або Hugging Face Spaces): `pip install -r requirements.txt` + `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`.
   - відео 58 МБ: або покласти на хостинг, або грати з NASA за `video_url`;
   - датасет (`data/features/*.json`) для деплою можна закомітити.
6. Перевірити з телефона й іншого комп'ютера.

## Готово, коли
- описи заповнені, 3 аудіотреки є, сайт відкривається за посиланням

## Промпт для ШІ
> Я №3 (дані, рендер аудіо, деплой) у проєкті Earth Information Jukebox. Прочитай `README.md`, `docs/architecture.md`, `data/README.md`, `docs/tasks/3-data-render-deploy.md`, `data/catalog.json`, `shared/schema/score.schema.json`, `sonify/score.py`. Пояснюй кожну команду простими словами. Почни із задачі 1.
