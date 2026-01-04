/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Deep Sea Blue
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
        // Golden Accents
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
        // Legacy primary color mapping
        primary: {
          50: '#e6f2ff',
          100: '#b3d9ff',
          200: '#80bfff',
          300: '#4da6ff',
          400: '#1a8cff',
          500: '#0073e6',
          600: '#005cb3',
          700: '#004580',
          800: '#002e4d',
          900: '#00171a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
        'gold': '0 4px 20px rgba(255, 215, 0, 0.3)',
        'sea': '0 4px 20px rgba(38, 141, 244, 0.3)',
      },
      backgroundImage: {
        'gradient-sea': 'linear-gradient(135deg, #0a1929 0%, #1a3f6d 100%)',
        'gradient-gold': 'linear-gradient(135deg, #FFD700 0%, #ffc91a 100%)',
      },
    },
  },
  plugins: [],
}
