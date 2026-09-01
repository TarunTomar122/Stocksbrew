import { beforeEach, describe, expect, it, vi } from "vitest";

const { adminFirestore, docs, getAiUniverse, getPriceUniverse } = vi.hoisted(() => {
  const docs = new Map<string, unknown>();

  const ref = (parts: string[]): any => ({
    path: parts.join("/"),
    collection: (name: string) => ref([...parts, name]),
    doc: (id: string) => ref([...parts, id]),
    get: async () => {
      const value = docs.get(parts.join("/"));
      return { exists: value !== undefined, data: () => value };
    },
  });

  return {
    docs,
    getAiUniverse: vi.fn(async () => "us_core_155"),
    getPriceUniverse: vi.fn(async () => "us_price_8"),
    adminFirestore: {
      collection: (name: string) => ref([name]),
      getAll: vi.fn(async (...refs: Array<{ path: string }>) =>
        refs.map(({ path }) => {
          const value = docs.get(path);
          return { exists: value !== undefined, data: () => value };
        }),
      ),
    },
  };
});

vi.mock("@/lib/firebase-admin", () => ({ adminFirestore }));
vi.mock("@/lib/firestore", () => ({
  batchGetRefs: vi.fn(),
  getLatestPrices: vi.fn(),
  getAiUniverse,
  getInstrument: vi.fn(async () => null),
  getPriceUniverse,
}));

import {
  getStockBusinessQuestions,
  getStockIntelligenceDoc,
} from "@/lib/stock";
import { getIntelUniverseIds } from "@/lib/universe-tiers";

describe("stock intelligence namespaces", () => {
  beforeEach(() => {
    docs.clear();
    docs.set("tm_config/instrument_universe_state", {
      US: { universe_id: "us_core_155" },
    });
  });

  it("finds generated theme-stock data in the historical runtime namespace", async () => {
    docs.set("tm_news_runs/US__us_core_100/stock_intelligence/US_WTS", {
      instrument_id: "US_WTS",
      headline: "Watts keeps water infrastructure moving",
    });
    docs.set("tm_news_runs/US__us_core_100/business_questions/US_WTS", {
      instrument_id: "US_WTS",
      ticker: "WTS",
      questions: Array.from({ length: 5 }, (_, index) => ({
        question: `Question ${index + 1}`,
        answer: `Answer ${index + 1}`,
      })),
    });

    expect(await getIntelUniverseIds("US")).toContain("us_core_100");
    expect(await getStockIntelligenceDoc("US_WTS", "US")).toMatchObject({
      instrument_id: "US_WTS",
    });
    expect((await getStockBusinessQuestions("US_WTS", "US"))?.questions).toHaveLength(5);
  });
});
