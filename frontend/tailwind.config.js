/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#EEF4FF',
          100: '#DCE7FE',
          200: '#BBD0FD',
          300: '#8EB1FB',
          400: '#5F89F6',
          500: '#3A66ED',
          600: '#1A56DB',
          700: '#1645B0',
          800: '#143C90',
          900: '#152F6E',
        },
        accent: {
          400: '#22D3EE',
          500: '#06B6D4',
          600: '#0891B2',
        },
        canvas: '#F8FAFF',
        ink: '#111827',
      },
      fontFamily: {
        sans: ['"Noto Sans JP"', 'system-ui', 'sans-serif'],
        display: ['"Zen Kaku Gothic New"', '"Noto Sans JP"', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 4px 20px -6px rgba(26, 86, 219, 0.12)',
        ring: '0 0 0 4px rgba(26, 86, 219, 0.10)',
        glow: '0 10px 40px -10px rgba(26, 86, 219, 0.45)',
      },
      backgroundImage: {
        'brand-gradient':
          'linear-gradient(135deg, #1A56DB 0%, #3A66ED 45%, #06B6D4 100%)',
        'hero-radial':
          'radial-gradient(1200px 600px at 50% -10%, rgba(26,86,219,0.15), transparent 60%), radial-gradient(800px 400px at 90% 10%, rgba(6,182,212,0.12), transparent 60%)',
      },
      animation: {
        'spin-slow': 'spin 2.4s linear infinite',
        shimmer: 'shimmer 2.2s linear infinite',
        'fade-in': 'fadeIn 0.4s ease-out both',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        fadeIn: {
          '0%': { opacity: 0, transform: 'translateY(8px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: 0.55 },
          '50%': { opacity: 1 },
        },
      },
    },
  },
  plugins: [],
};
