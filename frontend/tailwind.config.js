/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#EEF3FF',
          100: '#DCE7FE',
          200: '#BBD0FD',
          300: '#8EB1FB',
          400: '#5F89F6',
          500: '#3A66ED',
          600: '#1A56DB',
          700: '#1645B0',
          800: '#143C90',
          900: '#0F2A6B',
        },
        accent: {
          400: '#22D3EE',
          500: '#06B6D4',
          600: '#0891B2',
        },
        canvas: '#FAFBFC',
        paper: '#FFFFFF',
        ink: '#0F172A',
        muted: '#64748B',
      },
      fontFamily: {
        sans: ['"Inter"', '"Noto Sans JP"', 'system-ui', 'sans-serif'],
        display: ['"Inter"', '"Zen Kaku Gothic New"', '"Noto Sans JP"', 'sans-serif'],
      },
      boxShadow: {
        // プロらしいシンプルな影
        sm: '0 1px 2px 0 rgba(15, 23, 42, 0.04)',
        soft: '0 1px 3px 0 rgba(15, 23, 42, 0.06), 0 1px 2px -1px rgba(15, 23, 42, 0.04)',
        card: '0 4px 12px -2px rgba(15, 23, 42, 0.06), 0 2px 4px -2px rgba(15, 23, 42, 0.04)',
        elevated: '0 12px 28px -8px rgba(15, 23, 42, 0.12), 0 4px 8px -4px rgba(15, 23, 42, 0.06)',
      },
      animation: {
        'fade-in': 'fadeIn 0.35s ease-out both',
        'slide-up': 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) both',
        'slide-in-right': 'slideInRight 0.35s cubic-bezier(0.16, 1, 0.3, 1) both',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 },
        },
        slideUp: {
          '0%': { opacity: 0, transform: 'translateY(12px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: 0, transform: 'translateX(20px)' },
          '100%': { opacity: 1, transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
};
