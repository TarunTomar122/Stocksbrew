import { readFile } from "fs/promises";
import path from "path";

/**
 * The faces the cards draw with, read once per server process. Instrument Sans
 * is the interface face (`components/oa/font.ts`); Geist Mono carries numbers,
 * tickers and labels, as on the site. Satori needs TTF/OTF/WOFF, not WOFF2,
 * so the files live in `assets/og` instead of coming from next/font.
 *
 * The paths are spelled out in full so Vercel's file tracing ships them with
 * the route.
 */

export type OgFont = { name: string; data: ArrayBuffer; weight: 400 | 500 | 600 | 700; style: "normal" };

let pending: Promise<OgFont[]> | null = null;

async function read(file: string): Promise<ArrayBuffer> {
  const data = await readFile(file);
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

export function loadOgFonts(): Promise<OgFont[]> {
  if (!pending) {
    pending = Promise.all([
      read(path.join(process.cwd(), "assets/og/instrument-sans-400.ttf")),
      read(path.join(process.cwd(), "assets/og/instrument-sans-600.ttf")),
      read(path.join(process.cwd(), "assets/og/instrument-sans-700.ttf")),
      read(path.join(process.cwd(), "assets/og/geist-mono-500.ttf")),
    ])
      .then(([regular, semibold, bold, mono]): OgFont[] => [
        { name: "Instrument Sans", data: regular, weight: 400, style: "normal" },
        { name: "Instrument Sans", data: semibold, weight: 600, style: "normal" },
        { name: "Instrument Sans", data: bold, weight: 700, style: "normal" },
        { name: "Geist Mono", data: mono, weight: 500, style: "normal" },
      ])
      .catch((error) => {
        pending = null;
        throw error;
      });
  }
  return pending;
}
