/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        kce: {
          ring:      '#3d3540',
          olive:     'var(--kce-secondary)',
          brown:     '#4a3c38',
          cream:     'var(--kce-cream)',
          squirrel:  '#b8401a',
          bg:        'var(--kce-bg)',
          surface:   'var(--kce-surface)',
          surface2:  'var(--kce-surface2)',
          border:    'var(--kce-border)',
          muted:     'var(--kce-muted)',
          amber:     'var(--kce-primary)',
          'amber-light': 'var(--kce-primary)',
          'amber-dark':  'var(--kce-primary)',
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
