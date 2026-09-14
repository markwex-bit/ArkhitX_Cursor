/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ax: {
          bg: {
            DEFAULT: 'var(--ax-bg)',
            2: 'var(--ax-bg2)',
            3: 'var(--ax-bg3)',
            4: 'var(--ax-bg4)',
            hover: 'var(--ax-bg-hover)',
          },
          border: { DEFAULT: 'var(--ax-border)', light: 'var(--ax-border-light)' },
          text: { DEFAULT: 'var(--ax-text)', dim: 'var(--ax-text-dim)', muted: 'var(--ax-text-muted)' },
          primary: { DEFAULT: 'var(--ax-primary)', light: 'var(--ax-primary-light)', hover: 'var(--ax-primary-hover)' },
          accent: 'var(--ax-accent)',
          green: 'var(--ax-green)',
          amber: 'var(--ax-amber)',
          red: 'var(--ax-red)',
          blue: 'var(--ax-blue)',
          gate: { border: 'var(--ax-gate-border)', bg: 'var(--ax-gate-bg)', text: 'var(--ax-gate-text)' },
        },
      },
      boxShadow: {
        ax: 'var(--ax-shadow)',
        'ax-sm': 'var(--ax-shadow-sm)',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
