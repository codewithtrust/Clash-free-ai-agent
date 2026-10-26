/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0D1411",
          900: "#111C17",
          800: "#1B2A23",
          700: "#2A3D34",
          600: "#40564B",
          500: "#5B7166",
          400: "#61756A",
          300: "#ABBAAF",
          200: "#D0D9D3",
          100: "#E8EDE9",
          50: "#F3F6F3",
        },
        paper: "#F5F6F1",
        lime: {
          300: "#DDF9A1",
          400: "#C7F06A",
          500: "#AEDC47",
        },
        coral: {
          50: "#FFF1EE",
          100: "#FFE0DA",
          400: "#EE7A64",
          500: "#DF5D48",
          600: "#BB4030",
        },
        amber: {
          50: "#FFF8E8",
          100: "#FCEBC3",
          500: "#D99A2B",
          600: "#8F5A10",
        },
        teal: {
          50: "#EDF7F3",
          100: "#D4EEE5",
          500: "#277A60",
          600: "#1D5F4A",
        },
      },
      fontFamily: {
        sans: ["DM Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Manrope", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(13,20,17,.04), 0 10px 30px rgba(13,20,17,.05)",
        lift: "0 18px 48px rgba(13,20,17,.12)",
      },
      borderRadius: {
        "4xl": "2rem",
      },
      animation: {
        "fade-up": "fadeUp .45s cubic-bezier(.22,1,.36,1) both",
        "fade-in": "fadeIn .25s ease-out both",
        "pulse-soft": "pulseSoft 2.4s ease-in-out infinite",
        "slide-in": "slideIn .3s cubic-bezier(.22,1,.36,1) both",
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: ".45" },
        },
        slideIn: {
          "0%": { opacity: "0", transform: "translateX(24px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
      },
    },
  },
  plugins: [],
};
