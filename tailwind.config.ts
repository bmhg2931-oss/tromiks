import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#33463a",
        "ink-soft": "#5f6358",
        parchment: "#f5f4ef",
        "parchment-deep": "#e9e7de",
        brass: "#7f9a5e",
        "brass-deep": "#5f7a45",
        wine: "#7a3232",
        sage: "#4a6b34",
        line: "#ddd9d0",
      },
      fontFamily: {
        serif: ["'Rubik'", "serif"],
        sans: ["'Rubik'", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
