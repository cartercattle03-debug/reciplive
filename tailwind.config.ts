import type { Config } from "tailwindcss";

// RecipLive colors (Carter, 2026-10-14): sky blue #0369a1 headings, copper #b8732e accent, a light blue wash on alternate rows.
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: { 50: "#f0f8fd", 100: "#dff0fa", 200: "#b9dff3", 600: "#0369a1", 700: "#075985", 900: "#0c4a6e" },
        tan: "#f4e6d6",
        stripe: "#eef6fb",
        rust: "#b8732e",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
