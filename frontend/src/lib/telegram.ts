// Telegram Mini App SDK Integration
// @twa-dev/sdk v8+ uses different API - use window.Telegram.WebApp directly
// For compatibility, we'll use the global Telegram WebApp API

type WebAppType = {
  expand: () => void;
  enableClosingConfirmation: () => void;
  themeParams?: any;
  viewportHeight?: number;
  initData?: string;
  initDataUnsafe?: any;
  HapticFeedback?: {
    impactOccurred: (style: string) => void;
    notificationOccurred: (type: string) => void;
    selectionChanged: () => void;
  };
};

let webApp: WebAppType | null = null;

export function initTelegramWebApp(): WebAppType {
  if (typeof window === 'undefined') {
    // Server-side rendering fallback
    return {} as WebAppType;
  }

  if (webApp) {
    return webApp;
  }

  try {
    // Use global Telegram WebApp API (available in Telegram Mini Apps)
    const telegramWebApp = (window as any).Telegram?.WebApp;
    
    if (!telegramWebApp) {
      console.warn('Telegram WebApp not available');
      return {} as WebAppType;
    }
    
    webApp = telegramWebApp;
    
    // Expand to full screen
    if (webApp && webApp.expand) {
      webApp.expand();
    }

    // Enable closing confirmation
    if (webApp && webApp.enableClosingConfirmation) {
      webApp.enableClosingConfirmation();
    }

    // Set theme colors from Telegram
    if (webApp && webApp.themeParams) {
      const theme = webApp.themeParams;
      
      // Apply theme to CSS variables
      if (theme.bg_color) {
        document.documentElement.style.setProperty('--tg-theme-bg-color', theme.bg_color);
      }
      if (theme.text_color) {
        document.documentElement.style.setProperty('--tg-theme-text-color', theme.text_color);
      }
      if (theme.hint_color) {
        document.documentElement.style.setProperty('--tg-theme-hint-color', theme.hint_color);
      }
      if (theme.link_color) {
        document.documentElement.style.setProperty('--tg-theme-link-color', theme.link_color);
      }
      if (theme.button_color) {
        document.documentElement.style.setProperty('--tg-theme-button-color', theme.button_color);
      }
      if (theme.button_text_color) {
        document.documentElement.style.setProperty('--tg-theme-button-text-color', theme.button_text_color);
      }
      if (theme.secondary_bg_color) {
        document.documentElement.style.setProperty('--tg-theme-secondary-bg-color', theme.secondary_bg_color);
      }
    }

    // Set viewport height for mobile
    if (webApp && webApp.viewportHeight) {
      document.documentElement.style.setProperty('--tg-viewport-height', `${webApp.viewportHeight}px`);
    }

    console.log('✅ Telegram WebApp initialized');
    return webApp || ({} as WebAppType);
  } catch (error) {
    console.error('Failed to initialize Telegram WebApp:', error);
    return {} as WebAppType;
  }
}

export function getTelegramWebApp(): WebAppType | null {
  if (typeof window === 'undefined') {
    return null;
  }
  
  if (!webApp) {
    webApp = initTelegramWebApp();
  }
  
  return webApp;
}

// Haptic feedback helpers
export function triggerHapticImpact(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'medium') {
  const app = getTelegramWebApp();
  if (app && app.HapticFeedback && app.HapticFeedback.impactOccurred) {
    app.HapticFeedback.impactOccurred(style);
  }
}

export function triggerHapticNotification(type: 'error' | 'success' | 'warning' = 'success') {
  const app = getTelegramWebApp();
  if (app && app.HapticFeedback && app.HapticFeedback.notificationOccurred) {
    app.HapticFeedback.notificationOccurred(type);
  }
}

export function triggerHapticSelection() {
  const app = getTelegramWebApp();
  if (app && app.HapticFeedback && app.HapticFeedback.selectionChanged) {
    app.HapticFeedback.selectionChanged();
  }
}

// Check if running in Telegram
export function isTelegramWebApp(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return !!(window as any).Telegram?.WebApp;
}

// Get Telegram user data
export function getTelegramUser() {
  const app = getTelegramWebApp();
  return app?.initDataUnsafe?.user || null;
}

// Get init data for backend verification
export function getInitData(): string | null {
  const app = getTelegramWebApp();
  // In @twa-dev/sdk v8+, initData is available directly from WebApp
  return app?.initData || (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.initData) || null;
}

