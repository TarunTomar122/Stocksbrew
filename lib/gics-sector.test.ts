import { describe, expect, it } from "vitest";

import industrySectors from "@/backend/config/industry_sectors.json";
import { GICS_SECTORS, normalizeSectorName, resolveSector, sectorForIndustry } from "@/lib/gics-sector";

describe("sectorForIndustry", () => {
  it("files the mislabelled stocks under their real sector", () => {
    expect(sectorForIndustry("Biotechnology")).toBe("Health Care");
    expect(sectorForIndustry("Utilities")).toBe("Utilities");
    expect(sectorForIndustry("REITs")).toBe("Real Estate");
    expect(sectorForIndustry("Financial Data")).toBe("Financials");
    expect(sectorForIndustry("Financial Technology")).toBe("Financials");
    expect(sectorForIndustry("Metals & Mining")).toBe("Materials");
    expect(sectorForIndustry("Chemicals")).toBe("Materials");
  });

  it("keeps real technology industries in Technology", () => {
    for (const label of ["Semiconductors", "Software Infrastructure", "Software - Application", "Information Technology", "Quantum Computing"]) {
      expect(sectorForIndustry(label)).toBe("Technology");
    }
  });

  it("matches REIT, utility and oil families by pattern, ignoring case and spacing", () => {
    expect(sectorForIndustry("  industrial   REITs ")).toBe("Real Estate");
    expect(sectorForIndustry("REIT - Healthcare Facilities")).toBe("Real Estate");
    expect(sectorForIndustry("Mortgage REITs")).toBe("Financials");
    expect(sectorForIndustry("Utilities - Regulated Gas")).toBe("Utilities");
    expect(sectorForIndustry("Oil & Gas Something New")).toBe("Energy");
  });

  it("returns null for unknown or ambiguous labels", () => {
    expect(sectorForIndustry("")).toBeNull();
    expect(sectorForIndustry(null)).toBeNull();
    expect(sectorForIndustry("Consumer Electronics")).toBeNull();
    expect(sectorForIndustry("Exchange Traded Fund")).toBeNull();
    expect(sectorForIndustry("Something Else")).toBeNull();
  });

  it("only maps onto the eleven sector names", () => {
    const allowed = new Set<string>(GICS_SECTORS);
    for (const [label, sector] of Object.entries(industrySectors.industries)) {
      expect(label).toBe(label.toLowerCase().trim());
      expect(allowed.has(sector)).toBe(true);
    }
  });
});

describe("resolveSector", () => {
  it("prefers the industry over a wrong stored sector", () => {
    expect(resolveSector({ sector: "Technology", industry: "Biotechnology" })).toBe("Health Care");
    expect(resolveSector({ sector: "Energy", industry: "Metals & Mining" })).toBe("Materials");
  });

  it("falls back to the stored sector when the industry is missing or unknown", () => {
    expect(resolveSector({ sector: "Technology", industry: undefined })).toBe("Technology");
    expect(resolveSector({ sector: "Technology", industry: "Consumer Electronics" })).toBe("Technology");
    expect(resolveSector({ sector: "Healthcare" })).toBe("Health Care");
    expect(resolveSector({ sector: "Macro" })).toBeNull();
    expect(resolveSector({})).toBeNull();
  });
});

describe("normalizeSectorName", () => {
  it("folds the other naming schemes", () => {
    expect(normalizeSectorName("Consumer Cyclical")).toBe("Consumer Discretionary");
    expect(normalizeSectorName("information technology")).toBe("Technology");
    expect(normalizeSectorName("Consumer")).toBeNull();
  });
});
