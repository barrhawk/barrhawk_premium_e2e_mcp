/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'hsl(222 47% 5%)',
        foreground: 'hsl(210 40% 98%)',
        card: {
          DEFAULT: 'hsl(222 47% 8%)',
          foreground: 'hsl(210 40% 98%)',
        },
        popover: {
          DEFAULT: 'hsl(222 47% 8%)',
          foreground: 'hsl(210 40% 98%)',
        },
        primary: {
          DEFAULT: 'hsl(217 91% 60%)',
          foreground: 'hsl(222 47% 5%)',
        },
        secondary: {
          DEFAULT: 'hsl(262 83% 68%)',
          foreground: 'hsl(222 47% 5%)',
        },
        muted: {
          DEFAULT: 'hsl(217 33% 17%)',
          foreground: 'hsl(215 20% 65%)',
        },
        accent: {
          DEFAULT: 'hsl(217 33% 17%)',
          foreground: 'hsl(210 40% 98%)',
        },
        destructive: {
          DEFAULT: 'hsl(0 84% 60%)',
          foreground: 'hsl(210 40% 98%)',
        },
        border: 'hsl(217 33% 17%)',
        input: 'hsl(217 33% 17%)',
        ring: 'hsl(217 91% 60%)',
        // Custom BarrHawk colors
        bridge: 'hsl(217 91% 60%)',
        doctor: 'hsl(262 83% 68%)',
        igor: 'hsl(160 84% 39%)',
        stream: 'hsl(239 84% 67%)',
        ok: 'hsl(142 71% 45%)',
        warning: 'hsl(38 92% 50%)',
        error: 'hsl(0 84% 60%)',
        idle: 'hsl(215 20% 50%)',
      },
      borderRadius: {
        lg: '0.75rem',
        md: '0.5rem',
        sm: '0.25rem',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.5 },
        },
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
