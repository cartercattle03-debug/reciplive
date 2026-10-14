import type { Config } from "tailwindcss";

// Same palette as HerdLive: navy headers, tan / rust accents, a tan wash on alternate table rows.
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: { 50: "#f2f5f9", 100: "#e1e8f1", 200: "#c3d0e2", 600: "#1f3a5f", 700: "#172c48", 900: "#0e1b2d" },
        tan: "#ede0d0",
        stripe: "#f6eee4",
        rust: "#8b4030",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
