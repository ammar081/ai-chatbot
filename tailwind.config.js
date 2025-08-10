/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      keyframes: {
        typing: { "0%, 80%, 100%": { opacity: 0 }, "40%": { opacity: 1 } },
      },
      animation: {
        typing: "typing 1.4s infinite ease-in-out",
      },
    },
  },
  plugins: [],
};
