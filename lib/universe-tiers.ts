import { cache } from "react";

import { adminFirestore } from "@/lib/firebase-admin";
import { getAiUniverse, getPriceUniverse } from "@/lib/firestore";
import { sharedCache } from "@/lib/shared-cache";

const DEFAULT_COVERAGE_UNIVERSE: Record<"US" | "IN", string> = {
  US: "us_core_155",
  IN: "in_core_150",
};

const DEFAULT_RUNTIME_UNIVERSE: Record<"US" | "IN", string> = {
  US: "us_core_100",
  IN: "in_core_150",
};

/**
 * The coverage universe id per market from `tm_config/instrument_universe_state`. Same for everyone and only changed
 * when a universe is rotated, so it is kept for two minutes across requests (lib/shared-cache.ts) instead of costing
 * the stock page a store round trip before its intelligence and scorecard reads. A failed read throws, never kept.
 */
const readCoverageUniverseIds = sharedCache(
  async (): Promise<Partial<Record<"US" | "IN", string>>> => {
    const doc = await adminFirestore.collection("tm_config").doc("instrument_universe_state").get();
    const data = doc.exists ? (doc.data() as Record<string, { universe_id?: unknown } | undefined>) : {};
    const out: Partial<Record<"US" | "IN", string>> = {};
    for (const market of ["US", "IN"] as const) {
      const id = String(data?.[market]?.universe_id || "").trim();
      if (id) out[market] = id;
    }
    return out;
  },
  ["tm-config-instrument-universe-state-v1"],
  { revalidate: 120 },
);
// React's request cache only exists in the server-components build; elsewhere (tests, scripts) read each time.
const perRequest: typeof cache = typeof cache === "function" ? cache : (fn) => fn;
const coverageUniverseIds = perRequest(() => readCoverageUniverseIds());

/** coverage_catalog tier — ~500 slower-baseline names (historical id us_core_155). */
export async function getCoverageUniverse(market: "US" | "IN" = "US"): Promise<string> {
  const fromState = (await coverageUniverseIds())[market] ?? "";
  if (fromState) return fromState;
  return DEFAULT_COVERAGE_UNIVERSE[market];
}

/** All Firestore intel namespaces to search for scored peers (runtime + coverage). */
export async function getIntelUniverseIds(market: "US" | "IN" = "US"): Promise<string[]> {
  const [aiUniverse, priceUniverse, coverageUniverse] = await Promise.all([
    getAiUniverse(market).catch(() => ""),
    getPriceUniverse(market).catch(() => ""),
    getCoverageUniverse(market).catch(() => DEFAULT_COVERAGE_UNIVERSE[market]),
  ]);
  return [
    ...new Set(
      [
        priceUniverse,
        aiUniverse,
        coverageUniverse,
        DEFAULT_COVERAGE_UNIVERSE[market],
        DEFAULT_RUNTIME_UNIVERSE[market],
      ].filter(Boolean),
    ),
  ];
}
