import type { Config } from "tailwindcss";

// RecipLive colors (Carter, 2026-10-14): sky blue #0369a1 headings, copper #b8732e accent, light gray alternate rows with a thin charcoal line under each (look D).
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: { 50: "#f0f8fd", 100: "#dff0fa", 200: "#b9dff3", 600: "#0369a1", 700: "#075985", 900: "#0c4a6e" },
        tan: "#f4e6d6",
        stripe: "#f1f3f5",
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
