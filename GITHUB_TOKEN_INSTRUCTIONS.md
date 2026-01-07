# Инструкция по настройке GitHub Personal Access Token

## Быстрая настройка

### Вариант 1: Автоматический скрипт (рекомендуется)

```bash
cd /home/ubuntu
./setup_github_token.sh
```

Скрипт попросит ввести токен и автоматически настроит всё необходимое.

### Вариант 2: Ручная настройка

#### Шаг 1: Создайте Personal Access Token на GitHub

1. Перейдите: https://github.com/settings/tokens
2. Нажмите **"Generate new token (classic)"**
3. Заполните форму:
   - **Note**: `GSTD Platform Server`
   - **Expiration**: выберите срок (рекомендуется 90 дней или No expiration)
   - **Select scopes**: выберите **`repo`** (полный доступ к репозиториям)
4. Нажмите **"Generate token"**
5. **ВАЖНО**: Скопируйте токен сразу! Он показывается только один раз.

#### Шаг 2: Настройте git remote

```bash
cd /home/ubuntu

# Замените <TOKEN> на ваш реальный токен
git remote set-url origin https://<TOKEN>@github.com/gstdcoin/ai.git
```

**Пример:**
```bash
git remote set-url origin https://ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx@github.com/gstdcoin/ai.git
```

#### Шаг 3: Настройте credential helper (опционально, но рекомендуется)

Это сохранит токен, чтобы не вводить его каждый раз:

```bash
git config --global credential.helper store
```

#### Шаг 4: Проверьте подключение

```bash
# Проверка доступа к репозиторию
git ls-remote origin

# Или попробуйте fetch
git fetch --dry-run
```

## Использование после настройки

После настройки токена вы можете:

```bash
# Отправить локальные коммиты
git push origin main

# Получить изменения из GitHub
git pull origin main

# Отправить все ветки
git push --all origin
```

## Текущие незакоммиченные изменения

У вас есть незакоммиченные изменения. После настройки токена:

```bash
# Просмотреть изменения
git status

# Добавить все изменения
git add .

# Закоммитить
git commit -m "Fix: исправлены проблемы с падением платформы и DNS конфигурацией"

# Отправить в GitHub
git push origin main
```

## Безопасность

⚠️ **Важные замечания:**

1. **Токен = пароль** - храните его в секрете
2. Токен сохраняется в `~/.git-credentials` (если используется credential helper)
3. Для большей безопасности рекомендуется использовать **SSH ключи** вместо токена
4. Не коммитьте токен в репозиторий!

## Альтернатива: SSH ключи (более безопасно)

Если хотите использовать SSH вместо токена:

```bash
# 1. Создать SSH ключ
ssh-keygen -t ed25519 -C "platform@gstdtoken.com" -f ~/.ssh/id_ed25519

# 2. Показать публичный ключ
cat ~/.ssh/id_ed25519.pub

# 3. Добавить ключ в GitHub:
#    - Перейдите: https://github.com/settings/keys
#    - Нажмите "New SSH key"
#    - Вставьте содержимое ~/.ssh/id_ed25519.pub

# 4. Изменить remote на SSH
git remote set-url origin git@github.com:gstdcoin/ai.git

# 5. Проверить
ssh -T git@github.com
```

## Устранение проблем

### Ошибка: "fatal: could not read Username"
- Убедитесь, что токен правильно вставлен в URL
- Проверьте, что токен не истек
- Убедитесь, что у токена есть права `repo`

### Ошибка: "remote: Invalid username or password"
- Токен неверный или истек
- Создайте новый токен и обновите remote URL

### Ошибка: "Repository not found"
- Репозиторий приватный и токен не имеет доступа
- Убедитесь, что токен имеет права `repo`
- Проверьте, что репозиторий существует: https://github.com/gstdcoin/ai

