/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        kce: {
          ring:      '#3d3540',
          olive:     '#6b7c5a',
          brown:     '#4a3c38',
          cream:     '#f5ede0',
          squirrel:  '#b8401a',
          bg:        '#1a1410',
          surface:   '#241c18',
          surface2:  '#2e2420',
          border:    '#3d2e28',
          muted:     '#7a6258',
          amber:     '#e8a020',
          'amber-light': '#f0bc50',
          'amber-dark':  '#c4701a',
        }
      },
      fontFamily: {
        display: ['Lora', 'Georgia', 'serif'],
        body:    ['Nunito', 'system-ui', 'sans-serif'],
      },
      animation: {
        'bob':       'bob 3s ease-in-out infinite',
        'slide-up':  'slideUp .22s ease',
        'fade-in':   'fadeIn .18s ease',
        'spin-slow': 'spin 3s linear infinite',
      },
      keyframes: {
        bob:      { '0%,100%': {transform:'translateY(0) rotate(-4deg)'}, '50%':{transform:'translateY(-4px) rotate(4deg)'} },
        slideUp:  { from:{transform:'translateY(100%)'}, to:{transform:'translateY(0)'} },
        fadeIn:   { from:{opacity:'0',transform:'translateY(-6px)'}, to:{opacity:'1',transform:'translateY(0)'} },
      },
    },
  },
  plugins: [],
}
