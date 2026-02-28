/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      keyframes: {
        'pulse-well': {
          '0%, 100%': { boxShadow: '0 0 8px #10b981' },
          '50%': { boxShadow: '0 0 16px #10b981' },
        },
        'aspirate-pulse': {
          '0%, 100%': {
            boxShadow: '0 0 12px #3b82f6, inset 0 0 10px #3b82f6',
            transform: 'scale(1)',
          },
          '50%': {
            boxShadow: '0 0 24px #3b82f6, inset 0 0 20px #3b82f6',
            transform: 'scale(1.1)',
          },
        },
        'dispense-pulse': {
          '0%, 100%': {
            boxShadow: '0 0 12px #10b981, inset 0 0 10px #10b981',
            transform: 'scale(1)',
          },
          '50%': {
            boxShadow: '0 0 24px #10b981, inset 0 0 20px #10b981',
            transform: 'scale(1.15)',
          },
        },
        'move-pulse': {
          '0%, 100%': { boxShadow: '0 0 10px #f59e0b', opacity: '1' },
          '50%': { boxShadow: '0 0 20px #f59e0b', opacity: '0.8' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(-5px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'quick-op-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
      },
      animation: {
        'pulse-well': 'pulse-well 1.5s infinite',
        'aspirate': 'aspirate-pulse 1s infinite',
        'dispense': 'dispense-pulse 1s infinite',
        'move': 'move-pulse 0.8s infinite',
        'fade-in': 'fade-in 0.3s ease',
        'quick-op-pulse': 'quick-op-pulse 2s infinite',
      },
    },
  },
  plugins: [],
}
