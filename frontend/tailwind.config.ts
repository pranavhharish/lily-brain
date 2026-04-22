import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        teal: {
          900: '#0b3a3a',
          800: '#124d4c',
          700: '#175f5d',
          600: '#1e7371',
          500: '#2a8d8a',
          100: '#e4f1f0',
          50: '#f2f8f7',
        },
        amber: {
          700: '#b8771a',
          600: '#d68a1e',
          500: '#efa53b',
          400: '#f5bc5c',
          100: '#fbe9c8',
          50: '#fef6e6',
        },
        ink: {
          900: '#191714',
          800: '#29261f',
          700: '#403b32',
          600: '#5a5347',
          500: '#7a7263',
          400: '#9a927f',
          300: '#c4bda9',
          200: '#e4dfd2',
          100: '#f0ece0',
          50: '#f7f4eb',
        },
        ok: '#2e8560',
        warn: '#c86a1f',
        err: '#b33a2a',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'ui-monospace', 'monospace'],
        display: ['var(--font-instrument-serif)', 'Georgia', 'serif'],
      },
      boxShadow: {
        widget: '0 30px 80px rgba(41,38,31,0.18), 0 8px 24px rgba(41,38,31,0.06)',
        card: '0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.06)',
      },
      borderRadius: {
        pill: '14px',
      },
    },
  },
  plugins: [],
};

export default config;
