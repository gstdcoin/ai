// Telegram Mini App SDK Integration
// @twa-dev/sdk v8+ uses different API - use window.Telegram.WebApp directly
// For compatibility, we'll use the global Telegram WebApp API

export interface TelegramThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
  header_bg_color?: string;
  accent_text_color?: string;
  section_bg_color?: string;
  section_header_text_color?: string;
  subtitle_text_color?: string;
  destructive_text_color?: string;
}

export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    user?: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
      language_code?: string;
      is_premium?: boolean;
      photo_url?: string;
    };
    chat?: any;
    auth_date: number;
    hash: string;
  };
  version: string;
  platform: string;
  colorScheme: 'light' | 'dark';
  themeParams: TelegramThemeParams;
  isExpanded: boolean;
  viewportHeight: number;
  viewportStableHeight: number;
  headerColor: string;
  backgroundColor: string;
  isClosingConfirmationEnabled: boolean;
  BackButton: {
    isVisible: boolean;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
    show: () => void;
    hide: () => void;
  };
  MainButton: {
    text: string;
    color: string;
    textColor: string;
    isVisible: boolean;
    isActive: boolean;
    isProgressVisible: boolean;
    setText: (text: string) => void;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
    show: () => void;
    hide: () => void;
    enable: () => void;
    disable: () => void;
    showProgress: (leaveActive?: boolean) => void;
    hideProgress: () => void;
    setParams: (params: {
      text?: string;
      color?: string;
      text_color?: string;
      is_active?: boolean;
      is_visible?: boolean;
    }) => void;
  };
  HapticFeedback: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
    selectionChanged: () => void;
  };
  CloudStorage: {
    setItem: (key: string, value: string, callback?: (error: Error | null, success: boolean) => void) => void;
    getItem: (key: string, callback: (error: Error | null, value: string | null) => void) => void;
    getItems: (keys: string[], callback: (error: Error | null, values: Record<string, string>) => void) => void;
    removeItem: (key: string, callback?: (error: Error | null, success: boolean) => void) => void;
    removeItems: (keys: string[], callback?: (error: Error | null, success: boolean) => void) => void;
    getKeys: (callback: (error: Error | null, keys: string[]) => void) => void;
  };
  expand: () => void;
  close: () => void;
  ready: () => void;
  sendData: (data: string) => void;
  openLink: (url: string, options?: { try_instant_view?: boolean }) => void;
  openTelegramLink: (url: string) => void;
  openInvoice: (url: string, callback?: (status: string) => void) => void;
  showPopup: (params: {
    title?: string;
    message: string;
    buttons?: Array<{
      id?: string;
      type?: 'default' | 'ok' | 'close' | 'cancel' | 'destructive';
      text: string;
    }>;
  }, callback?: (id: string) => void) => void;
  showAlert: (message: string, callback?: () => void) => void;
  showConfirm: (message: string, callback?: (confirmed: boolean) => void) => void;
  showScanQrPopup: (params: {
    text?: string;
  }, callback?: (data: string) => void) => void;
  closeScanQrPopup: () => void;
  readTextFromClipboard: (callback?: (text: string) => void) => void;
  requestWriteAccess: (callback?: (granted: boolean) => void) => void;
  requestContact: (callback?: (granted: boolean) => void) => void;
  enableClosingConfirmation: () => void;
  disableClosingConfirmation: () => void;
  onEvent: (eventType: string, eventHandler: () => void) => void;
  offEvent: (eventType: string, eventHandler: () => void) => void;
  // Theme change event
  onThemeChanged?: (callback: () => void) => void;
}

type WebAppType = TelegramWebApp | null;

let webApp: WebAppType = null;
let themeChangeHandlers: Set<() => void> = new Set();

// Apply Telegram theme to CSS variables
export function applyTelegramTheme(theme: TelegramThemeParams) {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;

  // Core theme colors - background is critical
  if (theme.bg_color) {
    root.style.setProperty('--tg-theme-bg-color', theme.bg_color);
    root.style.setProperty('--tg-bg-color', theme.bg_color);
    // Apply to body background immediately
    // Do not override body background color to preserve Elite Cosmic Design
    // if (typeof document !== 'undefined' && document.body) {
    //   document.body.style.backgroundColor = theme.bg_color;
    // }
  }
  if (theme.text_color) {
    root.style.setProperty('--tg-theme-text-color', theme.text_color);
    root.style.setProperty('--tg-text-color', theme.text_color);
  }
  if (theme.hint_color) {
    root.style.setProperty('--tg-theme-hint-color', theme.hint_color);
    root.style.setProperty('--tg-hint-color', theme.hint_color);
  }
  if (theme.link_color) {
    root.style.setProperty('--tg-theme-link-color', theme.link_color);
    root.style.setProperty('--tg-link-color', theme.link_color);
  }

  // Button colors (critical for UI) - applied with higher priority
  if (theme.button_color) {
    root.style.setProperty('--tg-theme-button-color', theme.button_color);
    root.style.setProperty('--tg-button-color', theme.button_color);
    // Also set as primary button color for Tailwind/component usage
    root.style.setProperty('--tg-primary-button-color', theme.button_color);
  }
  if (theme.button_text_color) {
    root.style.setProperty('--tg-theme-button-text-color', theme.button_text_color);
    root.style.setProperty('--tg-button-text-color', theme.button_text_color);
    root.style.setProperty('--tg-primary-button-text-color', theme.button_text_color);
  }

  // Background colors
  if (theme.secondary_bg_color) {
    root.style.setProperty('--tg-theme-secondary-bg-color', theme.secondary_bg_color);
    root.style.setProperty('--tg-secondary-bg-color', theme.secondary_bg_color);
  }
  if (theme.header_bg_color) {
    root.style.setProperty('--tg-theme-header-bg-color', theme.header_bg_color);
    root.style.setProperty('--tg-header-bg-color', theme.header_bg_color);
  }
  if (theme.section_bg_color) {
    root.style.setProperty('--tg-theme-section-bg-color', theme.section_bg_color);
    root.style.setProperty('--tg-section-bg-color', theme.section_bg_color);
  }

  // Text colors
  if (theme.accent_text_color) {
    root.style.setProperty('--tg-theme-accent-text-color', theme.accent_text_color);
    root.style.setProperty('--tg-accent-text-color', theme.accent_text_color);
  }
  if (theme.section_header_text_color) {
    root.style.setProperty('--tg-theme-section-header-text-color', theme.section_header_text_color);
    root.style.setProperty('--tg-section-header-text-color', theme.section_header_text_color);
  }
  if (theme.subtitle_text_color) {
    root.style.setProperty('--tg-theme-subtitle-text-color', theme.subtitle_text_color);
    root.style.setProperty('--tg-subtitle-text-color', theme.subtitle_text_color);
  }
  if (theme.destructive_text_color) {
    root.style.setProperty('--tg-theme-destructive-text-color', theme.destructive_text_color);
    root.style.setProperty('--tg-destructive-text-color', theme.destructive_text_color);
  }

  // Notify all handlers about theme change
  themeChangeHandlers.forEach(handler => {
    try {
      handler();
    } catch (error) {
      console.error('Error in theme change handler:', error);
    }
  });
}

export function initTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === 'undefined') {
    return null;
  }

  if (webApp) {
    return webApp;
  }

  try {
    // Use global Telegram WebApp API (available in Telegram Mini Apps)
    const telegramWebApp = (window as any).Telegram?.WebApp as TelegramWebApp;

    if (!telegramWebApp) {
      // Telegram WebApp not available - this is expected in non-Telegram environments
      return null;
    }

    webApp = telegramWebApp;

    // Ready - notify Telegram that Mini App is ready
    if (webApp.ready) {
      webApp.ready();
    }

    // Expand to full screen
    if (webApp.expand) {
      webApp.expand();
    }

    // Enable closing confirmation
    if (webApp.enableClosingConfirmation) {
      webApp.enableClosingConfirmation();
    }

    // Apply initial theme
    if (webApp.themeParams) {
      applyTelegramTheme(webApp.themeParams);
    }

    // Set viewport height for mobile
    if (webApp.viewportHeight) {
      document.documentElement.style.setProperty('--tg-viewport-height', `${webApp.viewportHeight}px`);
    }

    // Subscribe to theme changes
    if (webApp.onThemeChanged) {
      webApp.onThemeChanged(() => {
        if (webApp?.themeParams) {
          applyTelegramTheme(webApp.themeParams);
        }
      });
    }

    // Set header and background colors
    if (webApp.headerColor) {
      document.documentElement.style.setProperty('--tg-header-color', webApp.headerColor);
    }
    if (webApp.backgroundColor) {
      document.documentElement.style.setProperty('--tg-background-color', webApp.backgroundColor);
    }

    // Telegram WebApp initialized successfully
    return webApp;
  } catch (error) {
    console.error('Failed to initialize Telegram WebApp:', error);
    return null;
  }
}

// Subscribe to theme changes
export function onThemeChanged(handler: () => void) {
  themeChangeHandlers.add(handler);
  return () => {
    themeChangeHandlers.delete(handler);
  };
}

export function getTelegramWebApp(): TelegramWebApp | null {
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
  if (app?.HapticFeedback?.impactOccurred) {
    app.HapticFeedback.impactOccurred(style);
  }
}

export function triggerHapticNotification(type: 'error' | 'success' | 'warning' = 'success') {
  const app = getTelegramWebApp();
  if (app?.HapticFeedback?.notificationOccurred) {
    app.HapticFeedback.notificationOccurred(type);
  }
}

export function triggerHapticSelection() {
  const app = getTelegramWebApp();
  if (app?.HapticFeedback?.selectionChanged) {
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
  return app?.initData || (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.initData) || null;
}

// Get current theme params
export function getTelegramTheme(): TelegramThemeParams | null {
  const app = getTelegramWebApp();
  return app?.themeParams || null;
}

// Get color scheme (light/dark)
export function getTelegramColorScheme(): 'light' | 'dark' | null {
  const app = getTelegramWebApp();
  return app?.colorScheme || null;
}

