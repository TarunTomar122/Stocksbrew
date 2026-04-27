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
      },
      fontFamily: {
        headline: ["Satoshi", "var(--font-geist-sans)", "system-ui", "sans-serif"],
        body: ["Satoshi", "var(--font-geist-sans)", "system-ui", "sans-serif"],
        label: ["Satoshi", "var(--font-geist-sans)", "system-ui", "sans-serif"],
        display: ["'Plus Jakarta Sans'", "Satoshi", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        DEFAULT: "0.125rem",
        lg: "0.25rem",
        xl: "0.5rem",
        full: "0.75rem",
      },
      letterSpacing: {
        editorial: "0.15em",
      },
    },
  },
  plugins: [],
};

export default config;
