/** Finviz-compatible sector slug resolution (mirrors backend/sector_slugs.py). */

const LABEL_TO_FINVIZ_SECTOR: Record<string, string> = {
  technology: "technology",
  healthcare: "healthcare",
  "health care": "healthcare",
  financial: "financial",
  financials: "financial",
  "financial services": "financial",
  "consumer cyclical": "consumercyclical",
  "consumer discretionary": "consumercyclical",
  "consumer defensive": "consumerdefensive",
  "consumer staples": "consumerdefensive",
  industrials: "industrials",
  "industrial goods": "industrials",
  "basic materials": "basicmaterials",
  energy: "energy",
  utilities: "utilities",
  "real estate": "realestate",
  "communication services": "communicationservices",
  "telecommunication services": "communicationservices",
};

export function finvizSectorSlugFromLabel(label: string): string {
  const text = String(label || "").trim().toLowerCase();
  if (!text) return "";
  return LABEL_TO_FINVIZ_SECTOR[text] || text.replace(/[^a-z0-9]+/g, "");
}

export function resolveSectorSlug(input: {
  sector_slug?: string | null;
  sector_label?: string | null;
  instrument_sector?: string | null;
  instrument_industry?: string | null;
}): string {
  const direct = String(input.sector_slug || "").trim();
  if (direct) return direct;
  const label =
    String(input.sector_label || "").trim() ||
    String(input.instrument_sector || "").trim() ||
    String(input.instrument_industry || "").trim();
  return finvizSectorSlugFromLabel(label);
}

export function sectorSlugForIntel(
  intel: { sector_slug?: string; sector_label?: string } | null | undefined,
  instrument?: { sector?: string; industry?: string } | null,
): string {
  return resolveSectorSlug({
    sector_slug: intel?.sector_slug,
    sector_label: intel?.sector_label,
    instrument_sector: instrument?.sector,
    instrument_industry: instrument?.industry,
  });
}
