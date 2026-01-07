# Настройка подключения к GitHub

## Текущий статус

**Репозиторий:** `https://github.com/gstdcoin/ai`  
**Ветка:** `main`  
**Статус:** Локальная ветка опережает origin/main на 1 коммит  
**Незакоммиченные изменения:** Да

## Проблемы с подключением

1. **HTTPS требует аутентификации** - нет настроенного токена доступа
2. **SSH ключи не настроены** - нет SSH ключей в `~/.ssh/`
3. **Репозиторий может быть приватным** - требуется аутентификация для push/pull

## Решения

### Вариант 1: Использование Personal Access Token (HTTPS)

1. Создайте Personal Access Token на GitHub:
   - Перейдите: https://github.com/settings/tokens
   - Нажмите "Generate new token (classic)"
   - Выберите права: `repo` (для приватных репозиториев)
   - Скопируйте токен

2. Настройте git для использования токена:
   ```bash
   # Вариант A: Использовать токен в URL (небезопасно, но просто)
   git remote set-url origin https://<TOKEN>@github.com/gstdcoin/ai.git
   
   # Вариант B: Использовать credential helper (рекомендуется)
   git config --global credential.helper store
   # При следующем push/pull введите username и токен как password
   ```

### Вариант 2: Использование SSH (рекомендуется)

1. Создайте SSH ключ:
   ```bash
   ssh-keygen -t ed25519 -C "platform@gstdtoken.com" -f ~/.ssh/id_ed25519
   ```

2. Добавьте публичный ключ в GitHub:
   ```bash
   cat ~/.ssh/id_ed25519.pub
   # Скопируйте вывод и добавьте в: https://github.com/settings/keys
   ```

3. Измените remote на SSH:
   ```bash
   git remote set-url origin git@github.com:gstdcoin/ai.git
   ```

4. Проверьте подключение:
   ```bash
   ssh -T git@github.com
   ```

### Вариант 3: Использование GitHub CLI

```bash
# Установите gh (если не установлен)
sudo apt install gh

# Авторизуйтесь
gh auth login

# Настройте git для использования gh
gh auth setup-git
```

## Текущие незакоммиченные изменения

После настройки аутентификации можно:

1. **Просмотреть изменения:**
   ```bash
   git diff
   ```

2. **Добавить изменения:**
   ```bash
   git add .
   ```

3. **Закоммитить:**
   ```bash
   git commit -m "Fix: исправлены проблемы с падением платформы"
   ```

4. **Отправить в GitHub:**
   ```bash
   git push origin main
   ```

## Проверка подключения

После настройки проверьте:
```bash
# Проверка SSH (если используете SSH)
ssh -T git@github.com

# Проверка HTTPS (если используете HTTPS)
git ls-remote origin

# Проверка fetch
git fetch --dry-run
```

