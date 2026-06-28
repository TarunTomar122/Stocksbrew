// Tokens lifted from app/globals.css (light theme only — the app has no dark mode in the video).
export const T = {
  bg: "#f8fafc",            // --background
  surface: "#ffffff",       // --surface
  surfaceLow: "#f6f7f9",    // --surface-container-low
  surfaceCt: "#f0f1f3",     // --surface-container
  surfaceHigh: "#eaebed",   // --surface-container-high
  ink: "#111215",           // --on-surface
  inkVar: "#3b4048",        // --on-surface-variant
  outline: "#d5d9e0",       // --outline-variant
  // signal colors — the brighter UI accents used throughout components
  bull: "#10b981",
  bear: "#ef4444",
  amber: "#f59e0b",
  blue: "#2563eb",
  blueInk: "#1e3a8a",
  terminal: "#22d3ee",      // accent used for the → conclusion arrow / links
  brand: "#047857",         // landing brand green
  brandDeep: "#065f46",
} as const;

export const shadowCard = "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)";
export const shadowSoft = "0 18px 50px rgba(17,24,39,0.06)";
export const shadowLift = "0 8px 24px rgba(0,0,0,0.06), 0 2px 6px rgba(0,0,0,0.04)";

// stance metadata mirrors STANCE_META in demo-radar.tsx
export const STANCE: Record<string, { label: string; bg: string; fg: string; dot: string }> = {
  accumulate: { label: "Accumulate", bg: "#e7f8f1", fg: "#047857", dot: "#10b981" },
  buy:        { label: "Buy",        bg: "#e7f8f1", fg: "#047857", dot: "#10b981" },
  trim:       { label: "Trim",       bg: "#fef3da", fg: "#b45309", dot: "#f59e0b" },
  watch:      { label: "Watch",      bg: "#e8eefc", fg: "#1e3a8a", dot: "#0052ff" },
  avoid:      { label: "Avoid",      bg: "#fdeaea", fg: "#b91c1c", dot: "#ef4444" },
  hold:       { label: "Hold",       bg: "#f0f1f3", fg: "#3b4048", dot: "#3b4048" },
};
