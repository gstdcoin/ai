/**
 * Theme Configuration for GSTD Platform
 * Glassmorphism Dark Theme with Deep Sea Blue & Golden Accents
 */

export const theme = {
  colors: {
    sea: {
      50: '#0a1929',
      100: '#0f2540',
      200: '#143256',
      300: '#1a3f6d',
      400: '#1f4c83',
      500: '#24599a',
      600: '#2966b0',
      700: '#2e73c7',
      800: '#3380dd',
      900: '#388df4',
    },
    gold: {
      50: '#fff9e6',
      100: '#fff3cc',
      200: '#ffedb3',
      300: '#ffe799',
      400: '#ffe180',
      500: '#ffdb66',
      600: '#ffd54d',
      700: '#ffcf33',
      800: '#ffc91a',
      900: '#FFD700',
    },
  },
  fonts: {
    sans: ['Inter', 'system-ui', 'sans-serif'],
    display: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
  },
  glassmorphism: {
    glass: {
      background: 'rgba(255, 255, 255, 0.1)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(255, 255, 255, 0.18)',
    },
    glassDark: {
      background: 'rgba(0, 0, 0, 0.2)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
    },
    glassGold: {
      background: 'rgba(255, 215, 0, 0.1)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(255, 215, 0, 0.3)',
    },
  },
  shadows: {
    glass: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
    gold: '0 4px 20px rgba(255, 215, 0, 0.3)',
    sea: '0 4px 20px rgba(38, 141, 244, 0.3)',
  },
  breakpoints: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
  },
} as const;

export type Theme = typeof theme;
