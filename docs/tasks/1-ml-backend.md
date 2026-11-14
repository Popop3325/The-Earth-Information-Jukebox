# №1: ML + Backend (капітан)

**Твої файли:** `pipeline/`, `backend/`, `requirements.txt`
**Не чіпай:** `sonify/` (№2), `frontend/` (№4, №5). Нову фічу додав? Повідом №2.

## Контекст
- `pipeline/run.py` бере відео з `data/raw/<id>.mp4` і налаштування з `data/catalog.json` (`crop`, `exclude`, `extractors`, `keyframes`), а пише `data/features/<id>.json`.
- Екстрактори: `pipeline/features.py` (basic), `pipeline/landcover.py` (зелень, забудова, вода, хмари; перенесено з прототипу гри).
- `backend/main.py` віддає `/api/videos`, `/api/features/<id>`, `/api/score/<id>` (викликає `sonify.build_score`), `/api/quiz/<id>`.

```bash
.venv/bin/python -m pipeline.run cancun_landcover   # фічі + роки
.venv/bin/python -m pipeline.run_all                # усі відео з data/raw/
.venv/bin/uvicorn backend.main:app --reload         # сервер
```

## Задачі

### MVP (до 12-ї години)
1. **Прогнати pipeline на відео від №3** і перевірити, що фічі «живі», тобто не всі ≈ 0 і не всі ≈ 1. За потреби підправити нормалізацію в `pipeline/features.py`.
2. **Валідація JSON:** pipeline і `/api/score` перевіряють результат за `shared/schema/*.schema.json` (пакет `jsonschema`) і падають із зрозумілою помилкою.
3. **Кеш партитури в backend:** не перебудовувати її на кожен запит, якщо не змінились фічі чи пресет (наприклад, за `mtime` файлів).

### ML (12–30 год), головна «фішка»
4. **Класифікатор land cover замість порогів RGB.** Зараз у 2017–2018 роках «зелень» штучно росте (див. `docs/architecture.md`).
   - Простий шлях: **KMeans** (sklearn) на кольорах пікселів (Lab або HSV) з 6–8 кластерів. Вручну призначити кластерам класи (ліс, місто, вода, хмари) за одним кадром. Зберегти модель (`joblib`) у `pipeline/models/`.
   - Краще: розмітити по ~200 пікселів кожного класу на 2–3 кадрах (скрипт з кліками в OpenCV) і навчити **RandomForest** на ознаках (RGB, HSV, текстура 5×5). Перевірити на іншому році.
   - Метрика якості: **забудова має рости монотонно, зелень спадати** з 1987 по 2018.
   - Вивести у pipeline як екстрактор `landcover_ml`, а старий `landcover` залишити для порівняння.
5. **Нормалізація кольору між кадрами** (histogram matching до першого кадру), щоб зміна балансу знімка не ламала класи.

### Покращення
6. **Фіча `scene_cut`** (0/1) для різких змін кадру (титри, переходи).
7. **CLIP zero-shot** (опційно): `mood_calm` / `mood_intense` за промптами. Рахувати 1 раз на секунду.
8. **Колірна шкала → реальне значення** для одного відео SVS (CO₂ або температура): зчитати легенду і перевести колір у фізичну величину.

### Фінал
9. Разом із №5 зробити подачу на сайті Space Apps.

## Готово, коли
- `pipeline.run_all` рахує всі відео; `/api/score` і `/api/quiz` віддають реальні дані
- ML-класифікатор дає монотонний ріст забудови для Канкуна

## Промпт для ШІ
> Я №1 (ML + backend) у проєкті Earth Information Jukebox. Прочитай `README.md`, `docs/architecture.md`, `docs/TEAM.md`, `docs/tasks/1-ml-backend.md`, увесь код у `pipeline/` і `backend/`, а також `data/catalog.json`. Не змінюй `shared/schema/*` без мого підтвердження. Почни із задачі 4 (ML-класифікатор land cover): спершу запропонуй план, потім реалізуй.
