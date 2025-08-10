/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      dropShadow: {
        glow: "0 0 30px rgba(59,130,246,0.35)",
      },
      colors: {
        surface: {
          light: "#FFFFFF",
          dark: "#0B0B0F",
        },
      },
    },
  },
  plugins: [],
};
