/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#0f1117',
        panel: '#171a23',
        edge: '#272b36',
      },
    },
  },
  plugins: [],
};
