import { useEffect } from 'react';
import { initTelegramWebApp, onThemeChanged, getTelegramTheme, applyTelegramTheme } from '../../lib/telegram';

/**
 * TelegramThemeProvider - автоматически применяет тему Telegram к приложению
 * Подписывается на изменения темы и обновляет CSS переменные
 */
export function TelegramThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Инициализация при монтировании
    const webApp = initTelegramWebApp();
    
    if (webApp) {
      // Применить начальную тему
      if (webApp.themeParams) {
        applyTelegramTheme(webApp.themeParams);
      }

      // Подписаться на изменения темы
      const unsubscribe = onThemeChanged(() => {
        const theme = getTelegramTheme();
        if (theme) {
          applyTelegramTheme(theme);
        }
      });

      // Также подписаться через Telegram API напрямую
      if (webApp.onThemeChanged) {
        webApp.onThemeChanged(() => {
          if (webApp.themeParams) {
            applyTelegramTheme(webApp.themeParams);
          }
        });
      }

      return () => {
        unsubscribe();
      };
    }
  }, []);

  return <>{children}</>;
}
