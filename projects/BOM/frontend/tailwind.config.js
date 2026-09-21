/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: '#1F2F69',
        panel: '#F6F8FC',
      },
    },
  },
  plugins: [],
}
