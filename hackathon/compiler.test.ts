import { describe, expect, it } from "vitest";
import { compileThesis, validateThesisDraft, normalizeThesisDraft } from "./compiler";
import type { ThesisDraft } from "./types";

describe("compileThesis", () => {
  it("compiles a short semiconductor thesis with tickers into a rich draft", () => {
    const result = compileThesis(
      "Semiconductor demand will expand structurally over the next 2 years because AI infrastructure spend is still early. NVIDIA, TSMC, and Micron should benefit."
    );

    expect(result.id).toMatch(/^thesis_\d+$/);
    expect(result.rawText).toBeTruthy();
    expect(result.title).toBeTruthy();
    expect(result.summary).toBeTruthy();
    expect(result.horizonMonths).toBe(24);
    expect(result.sectors.length).toBeGreaterThan(0);
    expect(result.beneficiaryTickers).toContain("NVDA");
    expect(result.beneficiaryTickers).toContain("TSM");
    expect(result.beneficiaryTickers).toContain("MU");
    expect(result.riskTickers.length).toBeGreaterThan(0);
    expect(result.entities.length).toBeGreaterThanOrEqual(5);
    expect(result.drivers.length).toBeGreaterThanOrEqual(2);

    for (const d of result.drivers) {
      expect(d.label.length).toBeGreaterThan(0);
      expect(d.label).not.toBe(result.rawText);
      expect(d.description.length).toBeGreaterThan(10);
      expect(["bullish", "bearish"]).toContain(d.polarity);
      expect(["demand", "supply", "pricing", "competition", "regulation", "profitability"]).toContain(d.category);
    }

    expect(result.disproofConditions.length).toBe(result.drivers.length);
    expect(result.evidenceHooks.length).toBe(result.drivers.length * 2);

    const weightSum = result.drivers.reduce((s, d) => s + d.weight, 0);
    expect(weightSum).toBeCloseTo(1, 2);

    const validation = validateThesisDraft(result);
    expect(validation.issues).toEqual([]);
    expect(validation.valid).toBe(true);
  });

  it("compiles a minimal semiconductor phrase without tickers into a rich draft", () => {
    const result = compileThesis("semiconductors are the place to be right now");

    expect(result.drivers.length).toBeGreaterThanOrEqual(2);
    expect(result.sectors.length).toBeGreaterThan(0);
    expect(result.beneficiaryTickers.length).toBeGreaterThan(0);
    expect(result.riskTickers.length).toBeGreaterThan(0);
    expect(result.entities.length).toBeGreaterThanOrEqual(3);

    for (const d of result.drivers) {
      expect(d.label).not.toBe(result.rawText);
    }

    const validation = validateThesisDraft(result);
    expect(validation.issues).toEqual([]);
    expect(validation.valid).toBe(true);
  });

  it("compiles 'healthcare goes brrrr' into a rich structured draft", () => {
    const result = compileThesis("healthcare goes brrrr");

    expect(result.id).toMatch(/^thesis_\d+$/);
    expect(result.summary.length).toBeGreaterThan(10);
    expect(result.title).toBeTruthy();
    expect(result.horizonMonths).toBe(12);

    expect(result.sectors).toContain("Healthcare");
    expect(result.beneficiaryTickers.length).toBeGreaterThanOrEqual(3);
    expect(result.riskTickers.length).toBeGreaterThanOrEqual(1);
    expect(result.entities.length).toBeGreaterThanOrEqual(5);

    expect(result.drivers.length).toBeGreaterThanOrEqual(2);

    for (const d of result.drivers) {
      expect(d.label.length).toBeGreaterThan(5);
      expect(d.label).not.toBe("Healthcare goes brrrr");
      expect(d.description.length).toBeGreaterThan(10);
      expect(["bullish", "bearish"]).toContain(d.polarity);
    }

    const bullCount = result.drivers.filter((d) => d.polarity === "bullish").length;
    const bearCount = result.drivers.filter((d) => d.polarity === "bearish").length;
    expect(bullCount).toBeGreaterThanOrEqual(1);
    expect(bearCount).toBeGreaterThanOrEqual(1);

    expect(result.disproofConditions.length).toBe(result.drivers.length);
    expect(result.evidenceHooks.length).toBe(result.drivers.length * 2);

    const weightSum = result.drivers.reduce((s, d) => s + d.weight, 0);
    expect(weightSum).toBeCloseTo(1, 2);

    const validation = validateThesisDraft(result);
    expect(validation.issues).toEqual([]);
    expect(validation.valid).toBe(true);
  });

  it("compiles a short healthcare phrase without tickers into a rich draft", () => {
    const result = compileThesis("biotech and pharma innovation will accelerate");

    expect(result.sectors).toContain("Healthcare");
    expect(result.beneficiaryTickers.length).toBeGreaterThan(0);
    expect(result.drivers.length).toBeGreaterThanOrEqual(2);

    for (const d of result.drivers) {
      expect(d.label).not.toBe(result.rawText);
    }

    const validation = validateThesisDraft(result);
    expect(validation.valid).toBe(true);
  });

  it("still handles explicit bull/bear paragraphs well", () => {
    const result = compileThesis(
      `Bull case: AI capex continues to accelerate across all hyperscalers driving GPU demand higher.
Bear case: custom ASIC adoption and export controls weaken the demand story before the 2-year payoff fully materializes.`,
      "Semiconductor Demand Expansion Thesis"
    );

    expect(result.drivers.length).toBeGreaterThanOrEqual(2);
    expect(result.beneficiaryTickers.length).toBeGreaterThan(0);
    expect(result.riskTickers.length).toBeGreaterThan(0);

    for (const d of result.drivers) {
      expect(d.label).not.toBe(result.rawText);
      expect(d.label.length).toBeLessThan(result.rawText.length);
    }

    const validation = validateThesisDraft(result);
    expect(validation.issues).toEqual([]);
    expect(validation.valid).toBe(true);
  });

  it("returns fallback drivers even for minimal unrecognized input", () => {
    const result = compileThesis("AI chips will grow.");
    expect(result.drivers.length).toBeGreaterThanOrEqual(2);

    for (const d of result.drivers) {
      expect(d.label).not.toBe("AI chips will grow.");
    }

    const validation = validateThesisDraft(result);
    expect(validation.valid).toBe(true);
  });

  it("compiles energy thesis from short input", () => {
    const result = compileThesis("energy demand will surge from data centers and LNG exports");

    expect(result.sectors.length).toBeGreaterThan(0);
    expect(result.drivers.length).toBeGreaterThanOrEqual(2);
    expect(result.beneficiaryTickers.length).toBeGreaterThan(0);

    const validation = validateThesisDraft(result);
    expect(validation.valid).toBe(true);
  });

  it("compiles fintech thesis from short input", () => {
    const result = compileThesis("digital payments and crypto are eating the world");

    expect(result.sectors.length).toBeGreaterThan(0);
    expect(result.drivers.length).toBeGreaterThanOrEqual(2);
    expect(result.beneficiaryTickers.length).toBeGreaterThan(0);

    const validation = validateThesisDraft(result);
    expect(validation.valid).toBe(true);
  });
});

describe("normalizeThesisDraft", () => {
  it("repairs missing fields with defaults", () => {
    const broken: ThesisDraft = {
      id: "",
      title: "",
      rawText: "test",
      summary: "",
      horizonMonths: -5,
      sectors: [],
      beneficiaryTickers: ["nvda", "nvda", ""],
      riskTickers: ["nvda", "AMD"],
      entities: [
        { name: "NVIDIA", type: "company" as const, ticker: "NVDA", role: "beneficiary" as const, description: "AI GPU leader" },
        { name: "AMD", type: "company" as const, ticker: "AMD", role: "risk" as const, description: "GPU competitor" },
      ],
      drivers: [
        {
          id: "",
          label: "",
          description: "Demand keeps growing",
          polarity: "bullish",
          category: "demand",
          weight: 0,
          horizon: "medium",
          trackedEntityNames: [],
          evidenceKeywords: [],
        },
        {
          id: "d2",
          label: "Supply tightens",
          description: "Supply chain remains constrained",
          polarity: "bearish",
          category: "supply",
          weight: 0.7,
          horizon: "medium",
          trackedEntityNames: [],
          evidenceKeywords: [],
        },
        {
          id: "d3",
          label: "",
          description: "",
          polarity: "bullish" as const,
          category: "invalid-cat" as ThesisDraft["drivers"][0]["category"],
          weight: 0,
          horizon: "century" as ThesisDraft["drivers"][0]["horizon"],
          trackedEntityNames: [],
          evidenceKeywords: [],
        },
      ],
      disproofConditions: [
        {
          id: "",
          condition: "Demand drops",
          driverId: "driver_0",
          threshold: "",
          horizon: "unknown" as ThesisDraft["disproofConditions"][0]["horizon"],
          signals: [],
        },
      ],
      evidenceHooks: [
        {
          id: "",
          label: "Demand confirms",
          driverId: "driver_0",
          kind: "confirming",
          entityNames: [],
          keywords: [],
          sourceTypes: ["invalid-type"],
        },
      ],
      createdAt: "",
      updatedAt: "",
    };

    const result = normalizeThesisDraft(broken);

    expect(result.id).toBeTruthy();
    expect(result.title).toBe("Untitled Thesis");
    expect(result.horizonMonths).toBe(12);
    expect(result.beneficiaryTickers).toEqual(["NVDA"]);
    expect(result.riskTickers).toEqual(["AMD"]);
    expect(result.drivers.length).toBe(2);
    expect(result.drivers[0].id).toMatch(/driver_/);
    expect(result.drivers[0].polarity).toBe("bullish");
    expect(result.drivers[0].category).toBe("demand");
    expect(result.drivers[0].horizon).toBe("medium");
    expect(result.drivers[1].category).toBe("supply");
    expect(result.drivers[1].polarity).toBe("bearish");

    const weightSum = result.drivers.reduce((s, d) => s + d.weight, 0);
    expect(weightSum).toBeCloseTo(1, 2);

    expect(result.disproofConditions.length).toBe(1);
    expect(result.evidenceHooks.length).toBe(1);
    expect(result.createdAt).toBeTruthy();
    expect(result.updatedAt).toBeTruthy();

    const validation = validateThesisDraft(result);
    expect(validation.valid).toBe(true);
  });

  it("preserves valid data unchanged", () => {
    const valid = compileThesis("NVDA will grow on AI demand over 12 months.");
    const normalized = normalizeThesisDraft(valid);

    expect(normalized.id).toBe(valid.id);
    expect(normalized.drivers.length).toBe(valid.drivers.length);
    expect(normalized.beneficiaryTickers).toEqual(valid.beneficiaryTickers);
  });
});
