import { unstable_cache } from "next/cache";
import { adminFirestore } from "@/lib/firebase-admin";

export type SectorRegime =
  | "expanding"
  | "momentum"
  | "topping"
  | "choppy"
  | "breaking_down"
  | "recovering";

export type SectorRegimeDoc = {
  market: "US" | "IN";
  sector: string;
  sector_slug: string;
  as_of_date?: string;
  generated_at?: string;
  regime: SectorRegime;
  conviction: number;
  narrative: string;
  invalidators?: string[];
  leadership_stocks?: string[];
};

export type MacroRegimeDoc = {
  market: "US" | "IN";
  as_of_date?: string;
  generated_at?: string;
  risk_appetite?: "on" | "off" | "mixed";
  market_phase?: "trending_up" | "distribution" | "correction" | "recovery" | "range";
  narrative?: string;
  leadership?: string[];
  laggards?: string[];
  rotation_signal?: string;
};

export function slugifySector(value: string): string {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function getSectorRegimesUncached(
  market: "US" | "IN" = "US",
): Promise<{ sectors: Record<string, SectorRegimeDoc>; macro: MacroRegimeDoc | null }> {
  const prefix = `${market.toUpperCase()}__`;
  const snap = await adminFirestore.collection("tm_sector_regimes").get();
  const sectors: Record<string, SectorRegimeDoc> = {};
  let macro: MacroRegimeDoc | null = null;

  for (const doc of snap.docs) {
    const id = doc.id;
    if (!id.startsWith(prefix) || id.includes("__bt_")) continue;
    const slug = id.slice(prefix.length);
    const data = doc.data();
    if (slug === "macro") {
      macro = data as MacroRegimeDoc;
      continue;
    }
    if (!data?.regime) continue;
    sectors[slug] = { ...(data as SectorRegimeDoc), sector_slug: slug };
  }

  return { sectors, macro };
}

// unstable_cache JSON-serializes return values — never return Map/Set here.
export const getSectorRegimes = unstable_cache(
  getSectorRegimesUncached,
  ["sector-regimes"],
  { revalidate: 300 },
);

export type SectorExposure = { sector: string; weightPct: number };

export type BookRegimeRead = {
  macro: MacroRegimeDoc | null;
  // Top sectors the user is exposed to, joined to their live regime.
  sectors: Array<{
    sector: string;
    weightPct: number;
    regime: SectorRegime;
    conviction: number;
    narrative: string;
    invalidators: string[];
  }>;
};

const REGIME_TONE: Record<SectorRegime, "good" | "warn" | "bad" | "neutral"> = {
  expanding: "good",
  momentum: "good",
  recovering: "neutral",
  choppy: "neutral",
  topping: "warn",
  breaking_down: "bad",
};

export function regimeTone(regime: SectorRegime): "good" | "warn" | "bad" | "neutral" {
  return REGIME_TONE[regime] ?? "neutral";
}

export const REGIME_LABEL: Record<SectorRegime, string> = {
  expanding: "Expanding",
  momentum: "Momentum",
  topping: "Topping",
  choppy: "Choppy",
  breaking_down: "Breaking down",
  recovering: "Recovering",
};

/**
 * Join the user's sector exposure to the live regime docs, strongest exposure
 * first. Returns null when there is no regime data to show.
 */
export async function getBookRegimeRead(
  market: "US" | "IN",
  exposure: SectorExposure[],
): Promise<BookRegimeRead | null> {
  if (exposure.length === 0) return null;
  const { sectors, macro } = await getSectorRegimes(market).catch(() => ({
    sectors: {} as Record<string, SectorRegimeDoc>,
    macro: null,
  }));
  if (Object.keys(sectors).length === 0 && !macro) return null;

  const joined: BookRegimeRead["sectors"] = [];
  for (const exp of [...exposure].sort((a, b) => b.weightPct - a.weightPct)) {
    const slug = slugifySector(exp.sector);
    const regime = sectors[slug];
    if (!regime) continue;
    joined.push({
      sector: exp.sector,
      weightPct: exp.weightPct,
      regime: regime.regime,
      conviction: regime.conviction,
      narrative: regime.narrative,
      invalidators: regime.invalidators ?? [],
    });
  }

  if (joined.length === 0 && !macro) return null;
  return { macro, sectors: joined.slice(0, 4) };
}
