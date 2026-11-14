# Як працюємо з репозиторієм

## Один раз на початку

1. Власник репозиторію створює його на GitHub і додає 4 інших учасників: **Settings → Collaborators**.
2. Кожен клонує його:
   ```bash
   git clone https://github.com/<owner>/<repo>.git
   ```
3. **Settings → Branches → Add rule** для `main`: увімкнути «Require a pull request before merging». Так ніхто не зламає `main` випадково.

## Щоденний цикл

```bash
git switch main
git pull                          # забрати свіже
git switch -c feature/<що-роблю>  # нова гілка, напр. feature/tone-synth
# ... працюємо ...
git add .
git commit -m "Коротко: що зроблено"
git push -u origin feature/<що-роблю>
```

Далі на GitHub натисніть **Compare & pull request**. Хтось один переглядає й натискає **Merge**.

## Правила

- **Одна гілка = одна задача.** Невеликі PR, часті злиття (кожні 2–4 години на хакатоні).
- **Не комітимо відео, кадри, `.venv`.** Усе це вже в `.gitignore`.
- **`shared/schema/features.schema.json` змінюємо лише після обговорення.** Від цього формату залежать і pipeline, і фронтенд.
- Конфлікт при злитті? Не панікуйте: `git pull origin main` у своїй гілці, виправте позначені місця й закомітьте.
- Хто працює зі ШІ: давайте йому прочитати `README.md`, `docs/architecture.md` і потрібну схему, щоб він дотримувався формату.

## Хто за що

Ролі, власники файлів, таймлайн і задачі кожного описано в [TEAM.md](TEAM.md).
