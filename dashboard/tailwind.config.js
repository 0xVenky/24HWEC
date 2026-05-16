/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      },
      colors: {
        f1: {
          bg: "#0a0a0a",
          panel: "#121212",
          row: "#191919",
          rowAlt: "#1f1f1f",
          divider: "#2a2a2a",
          accent: "#e10600", // F1 red
          dim: "#9aa0a6",
        },
      },
    },
  },
  plugins: [],
};
