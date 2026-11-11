import { Instrument_Sans } from "next/font/google";
import localFont from "next/font/local";

/**
 * The interface face for every oa-designed surface. Numbers, tickers and
 * labels use the mono face instead (`.oa-mono`, Geist Mono from the layout).
 *
 * The CSS variable keeps its original name (`--font-inter-tight`) because
 * dozens of surfaces already read it; only the font behind it changed.
 */
export const uiFont = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter-tight",
  display: "swap",
});

/** @deprecated name kept so existing imports keep working; use `uiFont`. */
export const interTight = uiFont;

/**
 * Geist Mono, for code and anything marked `.oa-code`. The same file the
 * `geist` package ships, declared here so it is not preloaded: only a few
 * glyphs on a few pages use it, and a preload made every page download it.
 */
export const monoFont = localFont({
  src: "../../node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2",
  variable: "--font-geist-mono",
  adjustFontFallback: false,
  preload: false,
  fallback: ["ui-monospace", "SFMono-Regular", "Roboto Mono", "Menlo", "Monaco", "Liberation Mono", "DejaVu Sans Mono", "Courier New", "monospace"],
  weight: "100 900",
});
