import industrySectors from "@/backend/config/industry_sectors.json";

/**
 * The sector a stock belongs in, from its industry label first.
 *
 * The instrument master's sector field is unreliable: an old seeding script
 * guessed sectors from industry keywords, so Amgen (Biotechnology), NextEra
 * (Utilities) and Prologis (REITs) were stored as Technology. The industry
 * labels are right, so the sector is derived from them when the label is
 * known, and the stored sector only stands when it is not. Mirrors
 * `sector_for_industry` in backend/agentdata/screener.py (same JSON map).
 */

export const GICS_SECTORS = [
  "Technology",
  "Health Care",
  "Financials",
  "Consumer Discretionary",
  "Consumer Staples",
  "Communication Services",
  "Industrials",
  "Energy",
  "Materials",
  "Real Estate",
  "Utilities",
] as const;

export type GicsSector = (typeof GICS_SECTORS)[number];

const BY_INDUSTRY: Record<string, string> = industrySectors.industries;

/** Other spellings of the eleven sector names (as stored or as the scraper reads them). */
const SECTOR_ALIASES: Record<string, GicsSector> = {
  technology: "Technology",
  "information technology": "Technology",
  "health care": "Health Care",
  healthcare: "Health Care",
  financials: "Financials",
  "financial services": "Financials",
  financial: "Financials",
  "consumer discretionary": "Consumer Discretionary",
  "consumer cyclical": "Consumer Discretionary",
  "consumer staples": "Consumer Staples",
  "consumer defensive": "Consumer Staples",
  "communication services": "Communication Services",
  communications: "Communication Services",
  industrials: "Industrials",
  energy: "Energy",
  materials: "Materials",
  "basic materials": "Materials",
  "real estate": "Real Estate",
  utilities: "Utilities",
};

function key(label: string | null | undefined): string {
  return String(label ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** One of the eleven sector names, or null for anything else ("Macro", "Consumer", ""). */
export function normalizeSectorName(label: string | null | undefined): GicsSector | null {
  return SECTOR_ALIASES[key(label)] ?? null;
}

/** The GICS sector an industry label belongs to, or null when the label is unknown or ambiguous. */
export function sectorForIndustry(industry: string | null | undefined): GicsSector | null {
  const label = key(industry);
  if (!label) return null;
  const exact = BY_INDUSTRY[label];
  if (exact) return exact as GicsSector;
  // Families whose members are named by pattern ("Office REITs", "Utilities - Regulated Gas").
  if (/\breits?\b/.test(label)) return label.includes("mortgage") ? "Financials" : "Real Estate";
  if (/^utilities\b|\butilities$/.test(label)) return "Utilities";
  if (label.startsWith("oil & gas")) return "Energy";
  return null;
}

/** The sector to show for a stock: from its industry when known, else its stored sector. */
export function resolveSector(row: { sector?: string | null; industry?: string | null }): GicsSector | null {
  return sectorForIndustry(row.industry) ?? normalizeSectorName(row.sector);
}
