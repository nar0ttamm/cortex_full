import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-plus-jakarta)", "system-ui", "sans-serif"],
        serif: ["var(--font-instrument)", "Georgia", "serif"],
      },
      colors: {
        slate: {
          50: "#f4f0ea",
          100: "#ebe4d8",
          200: "#e5ddd2",
          300: "#cfc5b6",
          400: "#a39b92",
          500: "#6b645b",
          600: "#524c45",
          700: "#3a352f",
          800: "#241f1a",
          900: "#1a1714",
          950: "#12100e",
        },
        teal: {
          50: "#fde8df",
          100: "#fad4c5",
          200: "#f5b199",
          300: "#ef8866",
          400: "#f06a3a",
          500: "#e24b1b",
          600: "#c43e14",
          700: "#9a3210",
          800: "#6b240e",
          900: "#3d1609",
          950: "#1f0b05",
        },
        cyan: {
          50: "#e4f3f0",
          100: "#c8e6e1",
          200: "#9ad3cb",
          300: "#63b8ad",
          400: "#3d9d93",
          500: "#1a6b63",
          600: "#145650",
          700: "#104540",
          800: "#0c342f",
          900: "#082420",
          950: "#041412",
        },
      },
    },
  },
  plugins: [],
};

export default config;
