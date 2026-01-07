# Исправление проблемы с QR-кодом TonConnect

## Проблема
При сканировании QR-кода ничего не происходит.

## Исправления

### 1. ✅ Создан manifest.json
- Файл: `frontend/public/tonconnect-manifest.json`
- URL: `https://app.gstdtoken.com/tonconnect-manifest.json`
- Содержит информацию о приложении

### 2. ✅ Упрощена конфигурация TonConnectUI
- Убраны несовместимые опции (uiPreferences)
- Используется только manifestUrl

### 3. ✅ Добавлено логирование
- Логи в консоль для отладки
- Проверка инициализации TonConnectUI

## Как проверить

1. Откройте консоль браузера (F12)
2. Обновите страницу
3. Нажмите "Подключить кошелек"
4. Проверьте логи:
   - `TonConnectUI initialized` - должно появиться
   - `Opening TonConnect modal...` - при нажатии
   - `TonConnect account connected` - после подключения

## Если проблема сохраняется

1. **Проверьте manifest.json**:
   ```bash
   curl https://app.gstdtoken.com/tonconnect-manifest.json
   ```
   Должен вернуть JSON

2. **Проверьте консоль браузера**:
   - Откройте DevTools (F12)
   - Вкладка Console
   - Ищите ошибки красным цветом

3. **Проверьте сеть**:
   - В DevTools → Network
   - Проверьте запросы к tonconnect-manifest.json

4. **Попробуйте другой кошелек**:
   - Tonkeeper
   - MyTonWallet
   - TON Wallet

## Важно

- Manifest должен быть доступен по HTTPS
- URL должен быть правильным в manifest
- Имя приложения должно быть указано

