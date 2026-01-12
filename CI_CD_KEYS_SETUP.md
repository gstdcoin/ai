# 🔐 Настройка SSH ключей для CI/CD

## ✅ Ключи созданы успешно!

Новая пара SSH ключей была создана для GitHub Actions.

## 📋 Информация о ключах

- **Приватный ключ**: `~/.ssh/github_actions_deploy`
- **Публичный ключ**: `~/.ssh/github_actions_deploy.pub`
- **Тип**: ED25519
- **Комментарий**: `github-actions-deploy-20260111`
- **Публичный ключ добавлен в**: `~/.ssh/authorized_keys`

## 🔑 Приватный ключ (для GitHub Secret `SSH_KEY`)

Скопируйте весь блок ниже (включая BEGIN и END):

```
-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
QyNTUxOQAAACBpCYgh/l4IJ0mwu7L34Cib+4pZrX+qtamUIpRHVouH/QAAAKgjdo5kI3aO
ZAAAAAtzc2gtZWQyNTUxOQAAACBpCYgh/l4IJ0mwu7L34Cib+4pZrX+qtamUIpRHVouH/Q
AAAECiJVDsn1z90nmEpCvQKBaepfMug3UgjYhtevp0arxLmmkJiCH+XggnSbC7svfgKJv7
ilmtf6q1qZQilEdWi4f9AAAAHmdpdGh1Yi1hY3Rpb25zLWRlcGxveS0yMDI2MDExMQECAw
QFBgc=
-----END OPENSSH PRIVATE KEY-----
```

## 📝 Инструкция по обновлению GitHub Secrets

### Шаг 1: Откройте настройки репозитория
1. Перейдите на https://github.com/gstdcoin/ai
2. Нажмите **Settings** → **Secrets and variables** → **Actions**

### Шаг 2: Обновите секреты

#### `SSH_KEY` (обновить)
1. Нажмите на секрет `SSH_KEY`
2. Нажмите **Update**
3. Вставьте приватный ключ (весь блок выше)
4. Нажмите **Update secret**

#### `SSH_HOST` (проверить)
- Значение: `82.115.48.228`
- Если отличается, обновите

#### `SSH_USER` (проверить)
- Значение: `ubuntu`
- Если отличается, обновите

#### `SSH_PORT` (опционально)
- Значение: `22` (или оставьте пустым)
- Если используете другой порт, обновите

#### `SSH_KNOWN_HOSTS` (обновить)
Скопируйте весь блок ниже:

```
|1|CGr94GysBSOU1NMyaykF02+7zmU=|klTvscr0LEIDqxEsxHLMdsImSyA= ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINqf/7pvRzFfPGL/Zk7bg1twG3oXTb1TYy8SmRz3ICgL
|1|Eg0kvOkm1ofDfEZTMoGIWjgSYMA=|ANoo3r13ColU9xyvEzWCu9OJ+1I= ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQDiwmuQBLKLmZueew+9pJF82p3ZijOKzjwFgZ9zSRoZx1MwKhLCt0e7Ibftn4qnlw+rC5djT7nuQiyGg7rLpGEk0Y42Fkk5Pwau/g/ShrLZNslGzGgCX+qJOE260hIC+jrZQwb9tR6DcKxNHeEBl2ktCdJLU/IQFkwp40kX+sdRLNAh1Y/l/TsKRwpELPFPGALlIIyLCPbXrCfNek3giSS1IIARil6c1HPZSoQM9d+xIUrJ/GXZ6eLrOiJi7nT9N41WlCy1casBd3SF/HBvSArdZVLvxNYLH8MN/0dBtFok/8a3jg4PQqxXxLkNst3bMC2gAKJ8x9VHvs5K3xNd+wXUcPB3B4f599sWXfT86YN5jFEpk0XeRrO1xCzveQMPIJpbqlHCLrT/vYHp4z/Ai1MX02deWN+Ew7hA04kv0oSKpaVGQJfGYuf12Nrvs8uMfAbf/GQwEDE34s6BQTWJfiSAxZiGpmPLsbHEPwGavOmxkZoWI8ez+erJ+/FtiYTr2Q8=
|1|f2bSO0PfubMQKlhfprkbzTDIAOk=|Hv8b/34fxWCY8zR/17HG60OACUk= ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBL6Fl2t8jdbv9PIJzPcHqcgh5vF9NY6mpEw1oJ8YPfmCsFc201IXGdqqdwgGuZ3MCpn/1XfxMw1dnQ9RgJitjGI=
```

Или выполните на сервере:
```bash
./scripts/show-ci-cd-keys.sh
```

## ✅ Проверка подключения

После обновления секретов, проверьте подключение:

```bash
# На сервере проверьте, что ключ добавлен
cat ~/.ssh/authorized_keys | grep github-actions-deploy

# Должна быть строка:
# ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGkJiCH+XggnSbC7svfgKJv7ilmtf6q1qZQilEdWi4f9 github-actions-deploy-20260111
```

## 🧪 Тестирование

После обновления секретов:

1. Перейдите в **Actions** на GitHub
2. Выберите workflow **CI/CD Pipeline**
3. Нажмите **Run workflow**
4. Выберите branch **main**
5. Нажмите **Run workflow**

Проверьте, что:
- ✅ SSH подключение успешно
- ✅ Код загружается
- ✅ Деплой выполняется

## 🔒 Безопасность

⚠️ **ВАЖНО:**
- Приватный ключ хранится только в GitHub Secrets
- Никогда не коммитьте приватный ключ в репозиторий
- Публичный ключ уже добавлен в `authorized_keys` на сервере
- Старые ключи можно удалить после успешного теста

## 🗑️ Удаление старых ключей (опционально)

Если хотите удалить старые ключи из `authorized_keys`:

```bash
# Сделайте backup
cp ~/.ssh/authorized_keys ~/.ssh/authorized_keys.backup

# Удалите старые ключи (если знаете их комментарии)
# Или оставьте все ключи для совместимости
```

## 📞 Troubleshooting

### Если SSH подключение не работает:

1. **Проверьте формат ключа**
   - Должен начинаться с `-----BEGIN OPENSSH PRIVATE KEY-----`
   - Должен заканчиваться `-----END OPENSSH PRIVATE KEY-----`
   - Не должно быть лишних пробелов

2. **Проверьте права доступа на сервере**
   ```bash
   chmod 700 ~/.ssh
   chmod 600 ~/.ssh/authorized_keys
   ```

3. **Проверьте SSH логи**
   ```bash
   sudo tail -f /var/log/auth.log
   ```

4. **Проверьте SSH конфигурацию**
   ```bash
   sudo nano /etc/ssh/sshd_config
   # Убедитесь, что:
   # PubkeyAuthentication yes
   # AuthorizedKeysFile .ssh/authorized_keys
   ```

5. **Перезапустите SSH сервис**
   ```bash
   sudo systemctl restart sshd
   ```

## 📅 Дата создания ключей

**Дата**: 11 января 2026  
**Версия**: 20260111

---

**Готово!** После обновления секретов в GitHub, CI/CD будет использовать новые ключи.
