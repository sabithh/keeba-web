import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        keeba: {
          primary: "var(--bg-primary)",
          surface: "var(--bg-surface)",
          card: "var(--bg-card)",
          border: "var(--border)",
          borderAccent: "var(--border-accent)",
          accent: "var(--accent)",
          accentLight: "var(--accent-light)",
          textPrimary: "var(--text-primary)",
          textMuted: "var(--text-muted)",
          textDim: "var(--text-dim)",
        },
      },
      borderRadius: {
        keeba: "12px",
        card: "14px",
        item: "8px",
      },
      boxShadow: {
        ambient: "0 24px 60px rgba(0, 0, 0, 0.25)",
      },
    },
  },
  plugins: [],
};

export default config;
