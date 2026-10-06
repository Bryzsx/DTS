/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        serif: ['"Source Serif 4"', "Georgia", "Cambria", "serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        white: "rgb(var(--c-white) / <alpha-value>)",
        // Official navy — the primary identity colour.
        navy: {
          50: "rgb(var(--c-navy-50) / <alpha-value>)",
          100: "rgb(var(--c-navy-100) / <alpha-value>)",
          200: "rgb(var(--c-navy-200) / <alpha-value>)",
          300: "rgb(var(--c-navy-300) / <alpha-value>)",
          400: "rgb(var(--c-navy-400) / <alpha-value>)",
          500: "rgb(var(--c-navy-500) / <alpha-value>)",
          600: "rgb(var(--c-navy-600) / <alpha-value>)",
          700: "rgb(var(--c-navy-700) / <alpha-value>)",
          800: "rgb(var(--c-navy-800) / <alpha-value>)",
          900: "rgb(var(--c-navy-900) / <alpha-value>)",
          950: "rgb(var(--c-navy-950) / <alpha-value>)",
        },
        // Muted gold — reserved for rules, seals and active accents only.
        gold: {
          100: "rgb(var(--c-gold-100) / <alpha-value>)",
          200: "rgb(var(--c-gold-200) / <alpha-value>)",
          300: "rgb(var(--c-gold-300) / <alpha-value>)",
          400: "rgb(var(--c-gold-400) / <alpha-value>)",
          500: "rgb(var(--c-gold-500) / <alpha-value>)",
          600: "rgb(var(--c-gold-600) / <alpha-value>)",
          700: "rgb(var(--c-gold-700) / <alpha-value>)",
        },
        slate: {
          50: "rgb(var(--c-slate-50) / <alpha-value>)",
          100: "rgb(var(--c-slate-100) / <alpha-value>)",
          200: "rgb(var(--c-slate-200) / <alpha-value>)",
          300: "rgb(var(--c-slate-300) / <alpha-value>)",
          400: "rgb(var(--c-slate-400) / <alpha-value>)",
          500: "rgb(var(--c-slate-500) / <alpha-value>)",
          600: "rgb(var(--c-slate-600) / <alpha-value>)",
          700: "rgb(var(--c-slate-700) / <alpha-value>)",
          800: "rgb(var(--c-slate-800) / <alpha-value>)",
          900: "rgb(var(--c-slate-900) / <alpha-value>)",
          950: "rgb(var(--c-slate-950) / <alpha-value>)",
        },
        // Status colours. Amber = attention, red = overdue, blue = in review,
        // slate = closed. Green is deliberately absent — it reads as "approved"
        // where in this system "completed" is the meaningful state.
        amber: {
          50: "rgb(var(--c-amber-50) / <alpha-value>)",
          100: "rgb(var(--c-amber-100) / <alpha-value>)",
          200: "rgb(var(--c-amber-200) / <alpha-value>)",
          500: "rgb(var(--c-amber-500) / <alpha-value>)",
          600: "rgb(var(--c-amber-600) / <alpha-value>)",
          700: "rgb(var(--c-amber-700) / <alpha-value>)",
          800: "rgb(var(--c-amber-800) / <alpha-value>)",
          900: "rgb(var(--c-amber-900) / <alpha-value>)",
        },
        red: {
          50: "rgb(var(--c-red-50) / <alpha-value>)",
          100: "rgb(var(--c-red-100) / <alpha-value>)",
          200: "rgb(var(--c-red-200) / <alpha-value>)",
          500: "rgb(var(--c-red-500) / <alpha-value>)",
          600: "rgb(var(--c-red-600) / <alpha-value>)",
          700: "rgb(var(--c-red-700) / <alpha-value>)",
          800: "rgb(var(--c-red-800) / <alpha-value>)",
          900: "rgb(var(--c-red-900) / <alpha-value>)",
        },
        blue: {
          50: "rgb(var(--c-blue-50) / <alpha-value>)",
          100: "rgb(var(--c-blue-100) / <alpha-value>)",
          200: "rgb(var(--c-blue-200) / <alpha-value>)",
          500: "rgb(var(--c-blue-500) / <alpha-value>)",
          600: "rgb(var(--c-blue-600) / <alpha-value>)",
          700: "rgb(var(--c-blue-700) / <alpha-value>)",
          800: "rgb(var(--c-blue-800) / <alpha-value>)",
          900: "rgb(var(--c-blue-900) / <alpha-value>)",
        },
      },
      boxShadow: {
        soft: "0 1px 2px rgba(11, 37, 69, 0.05)",
        card: "0 1px 2px rgba(11, 37, 69, 0.04), 0 4px 12px -4px rgba(11, 37, 69, 0.07)",
        elevated: "0 2px 4px -1px rgba(11, 37, 69, 0.05), 0 8px 20px -8px rgba(11, 37, 69, 0.12)",
        pop: "0 0 0 1px rgba(11, 37, 69, 0.06), 0 12px 32px -12px rgba(11, 37, 69, 0.18)",
      },
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.32, 0.72, 0, 1)",
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in-up": "fade-in-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) both",
        "fade-in": "fade-in 0.25s ease-out both",
        "slide-up": "slide-up 0.25s cubic-bezier(0.16, 1, 0.3, 1) both",
      },
      borderRadius: {
        "4xl": "2rem",
      },
    },
  },
  plugins: [],
}
