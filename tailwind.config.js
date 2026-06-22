/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        ink: {
          50: '#f5f6fa',
          100: '#e9ebf3',
          200: '#cfd4e6',
          300: '#a7afd0',
          400: '#7882b3',
          500: '#566099',
          600: '#434b7f',
          700: '#383e67',
          800: '#2f3456',
          900: '#1d2138',
          950: '#13162a',
        },
        brand: {
          50: '#eef6ff',
          100: '#d9eaff',
          200: '#bcdaff',
          300: '#8ec3ff',
          400: '#599fff',
          500: '#3478f6',
          600: '#1f5aeb',
          700: '#1846d4',
          800: '#1a3bab',
          900: '#1b3787',
          950: '#152352',
        },
        accent: {
          400: '#34d3a6',
          500: '#16b387',
          600: '#0d8e6c',
        },
      },
      boxShadow: {
        soft: '0 1px 2px rgba(16,24,40,0.04), 0 8px 24px -12px rgba(16,24,40,0.18)',
        glow: '0 0 0 1px rgba(52,120,246,0.15), 0 12px 40px -12px rgba(52,120,246,0.35)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.35s ease-out both',
      },
    },
  },
  plugins: [],
}
