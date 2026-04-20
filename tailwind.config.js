/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{js,ts,jsx,tsx}', './src/renderer/index.html'],
  theme: {
    extend: {}
  },
  plugins: [require('daisyui')],
  daisyui: {
    themes: [
      {
        lexicon: {
          primary: '#7c6af7',
          'primary-content': '#ffffff',
          secondary: '#a78bfa',
          'secondary-content': '#ffffff',
          accent: '#c4b5fd',
          'accent-content': '#1e1b2e',
          neutral: '#2a2535',
          'neutral-content': '#d4d0e8',
          'base-100': '#13111e',
          'base-200': '#1a1726',
          'base-300': '#211e30',
          'base-content': '#d4d0e8',
          info: '#38bdf8',
          success: '#4ade80',
          warning: '#fbbf24',
          error: '#f87171'
        }
      }
    ],
    darkTheme: 'lexicon'
  }
}
