import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        orion: {
          gold: "#D4AF37",
          bg: "#F9F8F6",
          text: "#1A1A1A",
          border: "#1A1A1A",
        },
        /** Kept for financial data display — tuned to match Orion palette */
        gf: {
          bg: "#F9F8F6",
          surface: "#FFFFFF",
          hairline: "#1A1A1A",
          border: "#1A1A1A",
          blue: "#D4AF37",
          "blue-hover": "#B8972E",
          chip: "#F5EFD7",
          "chip-text": "#6B5B1E",
          text: "#1A1A1A",
          "text-2": "#4A4A4A",
          "text-3": "#8A8A8A",
          green: "#2D6A4F",
          red: "#9B2226",
        },
        background: "#F9F8F6",
        surface: {
          DEFAULT: "#F9F8F6",
          dim: "#F0EDE7",
          bright: "#FDFCFA",
          "container-lowest": "#FFFFFF",
          "container-low": "#F5F3EF",
          container: "#F0EDE7",
          "container-high": "#E8E5DF",
          "container-highest": "#E0DDD7",
          variant: "#E8E5DF",
          tint: "#1A1A1A",
        },
        sidebar: {
          DEFAULT: "#1A1A1A",
          hover: "#2A2A2A",
          active: "#3A3A3A",
          icon: "#8A8A8A",
          "icon-active": "#F9F8F6",
        },
        primary: {
          DEFAULT: "#1A1A1A",
          container: "#2A2A2A",
          fixed: "#E8E5DF",
          "fixed-dim": "#D0CDC7",
        },
        accent: {
          DEFAULT: "#D4AF37",
          light: "#E0C35A",
          dim: "#B8972E",
          muted: "rgba(212, 175, 55, 0.12)",
          "muted-strong": "rgba(212, 175, 55, 0.20)",
        },
        secondary: {
          DEFAULT: "#6A6A6A",
          container: "#E8E5DF",
          fixed: "#E8E5DF",
          "fixed-dim": "#D0CDC7",
        },
        tertiary: {
          DEFAULT: "#2D6A4F",
          container: "#34A065",
          fixed: "#D4F5E2",
          "fixed-dim": "#A8E6C1",
        },
        error: {
          DEFAULT: "#9B2226",
          container: "#FFECEA",
        },
        outline: {
          DEFAULT: "#1A1A1A",
          variant: "#1A1A1A",
        },
        "on-surface": {
          DEFAULT: "#1A1A1A",
          variant: "#4A4A4A",
        },
        "on-primary": "#F9F8F6",
        "on-secondary": "#F9F8F6",
        "on-tertiary": "#F9F8F6",
        "on-error": "#F9F8F6",
        "on-background": "#1A1A1A",
        "inverse-surface": "#1A1A1A",
        "inverse-on-surface": "#F9F8F6",
        "inverse-primary": "#D4AF37",
      },
      fontFamily: {
        headline: ["var(--font-geist-sans)", "Geist", "system-ui", "sans-serif"],
        body: ["var(--font-geist-sans)", "Geist", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "Geist Mono", "ui-monospace", "monospace"],
        label: ["var(--font-geist-sans)", "Geist", "system-ui", "sans-serif"],
        serif: ["var(--font-geist-sans)", "Geist", "system-ui", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "0px",
        sm: "0px",
        md: "0px",
        lg: "0px",
        xl: "0px",
        "2xl": "0px",
        "3xl": "0px",
        full: "9999px",
      },
      boxShadow: {
        ambient: "0 4px 20px rgba(26, 26, 26, 0.04)",
        "ambient-lg": "0 8px 30px rgba(26, 26, 26, 0.06)",
        soft: "0 1px 2px rgba(26, 26, 26, 0.03)",
        card: "0 2px 8px rgba(26, 26, 26, 0.04)",
        sm: "0 1px 2px rgba(26, 26, 26, 0.03)",
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "1rem" }],
      },
      width: {
        sidebar: "4rem",
      },
      spacing: {
        sidebar: "4rem",
      },
      letterSpacing: {
        editorial: "0.25em",
      },
    },
  },
  plugins: [],
};

export default config;
