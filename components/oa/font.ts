import { Instrument_Sans } from "next/font/google";

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
