import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        /* Brand / primary */
        primary: {
          DEFAULT: "var(--primary)",
          container: "var(--primary-container)",
          fixed: "var(--primary-fixed)",
          "fixed-dim": "var(--primary-fixed-dim)",
        },
        "on-primary": {
          DEFAULT: "var(--on-primary)",
          container: "var(--on-primary-container)",
          fixed: "var(--on-primary-fixed)",
          "fixed-variant": "var(--on-primary-fixed-variant)",
        },
        "inverse-primary": "var(--inverse-primary)",

        /* Secondary */
        secondary: {
          DEFAULT: "var(--secondary)",
          container: "var(--secondary-container)",
          fixed: "var(--secondary-fixed)",
          "fixed-dim": "var(--secondary-fixed-dim)",
        },
        "on-secondary": {
          DEFAULT: "var(--on-secondary)",
          container: "var(--on-secondary-container)",
          fixed: "var(--on-secondary-fixed)",
          "fixed-variant": "var(--on-secondary-fixed-variant)",
        },

        /* Tertiary */
        tertiary: {
          DEFAULT: "var(--tertiary)",
          container: "var(--tertiary-container)",
          fixed: "var(--tertiary-fixed)",
          "fixed-dim": "var(--tertiary-fixed-dim)",
        },
        "on-tertiary": {
          DEFAULT: "var(--on-tertiary)",
          container: "var(--on-tertiary-container)",
          fixed: "var(--on-tertiary-fixed)",
          "fixed-variant": "var(--on-tertiary-fixed-variant)",
        },

        /* Error */
        error: {
          DEFAULT: "var(--error)",
          container: "var(--error-container)",
        },
        "on-error": {
          DEFAULT: "var(--on-error)",
          container: "var(--on-error-container)",
        },

        /* Background / surfaces */
        background: "var(--background)",
        "on-background": "var(--on-background)",
        surface: {
          DEFAULT: "var(--surface)",
          bright: "var(--surface-bright)",
          dim: "var(--surface-dim)",
          tint: "var(--surface-tint)",
          variant: "var(--surface-variant)",
          "container-lowest": "var(--surface-container-lowest)",
          "container-low": "var(--surface-container-low)",
          container: "var(--surface-container)",
          "container-high": "var(--surface-container-high)",
          "container-highest": "var(--surface-container-highest)",
        },
        "on-surface": {
          DEFAULT: "var(--on-surface)",
          variant: "var(--on-surface-variant)",
        },
        "inverse-surface": "var(--inverse-surface)",
        "inverse-on-surface": "var(--inverse-on-surface)",

        /* Outlines */
        outline: {
          DEFAULT: "var(--outline)",
          variant: "var(--outline-variant)",
        },

        /* Signal colors for charts/badges */
        signal: {
          bullish: "var(--signal-bullish)",
          bearish: "var(--signal-bearish)",
          neutral: "var(--signal-neutral)",
        },
        "accent-terminal": "var(--accent-terminal)",
        "landing-brand": "var(--landing-brand)",
        "landing-mint": "var(--landing-mint)",
        "landing-reddit": "var(--landing-reddit)",
      },
      fontFamily: {
        headline: ["Satoshi", "var(--font-geist-sans)", "system-ui", "sans-serif"],
        body: ["Satoshi", "var(--font-geist-sans)", "system-ui", "sans-serif"],
        label: ["Satoshi", "var(--font-geist-sans)", "system-ui", "sans-serif"],
        display: ["'Plus Jakarta Sans'", "Satoshi", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        sm: "0.375rem",   /* 6px */
        DEFAULT: "0.5rem", /* 8px */
        md: "0.625rem",    /* 10px */
        lg: "0.75rem",     /* 12px */
        xl: "1rem",        /* 16px */
        "2xl": "1.25rem",  /* 20px */
        "3xl": "1.5rem",   /* 24px */
        full: "9999px",
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)",
        "card-hover": "0 8px 24px rgba(0,0,0,0.06), 0 2px 6px rgba(0,0,0,0.04)",
        dropdown: "0 12px 40px rgba(0,0,0,0.10), 0 4px 12px rgba(0,0,0,0.05)",
        modal: "0 24px 60px rgba(0,0,0,0.14), 0 8px 20px rgba(0,0,0,0.08)",
        glow: "0 0 24px rgba(107,56,212,0.12)",
        inner: "inset 0 2px 4px rgba(0,0,0,0.03)",
      },
      letterSpacing: {
        editorial: "0.12em",
        wide: "0.08em",
        tighter: "-0.04em",
        tight: "-0.02em",
      },
      transitionTimingFunction: {
        "apple-ease": "cubic-bezier(0.25, 0.1, 0.25, 1)",
        "spring": "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
      keyframes: {
        "stock-ai-marquee": {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      animation: {
        "stock-ai-marquee": "stock-ai-marquee 42s linear infinite",
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};

export default config;
