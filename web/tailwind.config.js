/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  plugins: [require('daisyui'), require('@tailwindcss/typography')],
  daisyui: {
    themes: [
      {
        lexicon: {
          'color-scheme': 'dark',
          'base-100': '#13111e',
          'base-200': '#1a1825',
          'base-300': '#252235',
          'base-content': '#e8e5f5',
          primary: '#7c6af7',
          'primary-content': '#ffffff',
          secondary: '#a78bfa',
          accent: '#7c6af7',
          neutral: '#2a2740',
          info: '#38bdf8',
          success: '#4ade80',
          warning: '#f59e0b',
          error: '#f87171',
        },
      },
    ],
  },
}
