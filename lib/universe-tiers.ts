import { adminFirestore } from "@/lib/firebase-admin";
import { getAiUniverse, getPriceUniverse } from "@/lib/firestore";

const DEFAULT_COVERAGE_UNIVERSE: Record<"US" | "IN", string> = {
  US: "us_core_155",
  IN: "in_core_150",
};

const DEFAULT_RUNTIME_UNIVERSE: Record<"US" | "IN", string> = {
  US: "us_core_100",
  IN: "in_core_150",
};

/** coverage_catalog tier — ~500 slower-baseline names (historical id us_core_155). */
export async function getCoverageUniverse(market: "US" | "IN" = "US"): Promise<string> {
  const doc = await adminFirestore.collection("tm_config").doc("instrument_universe_state").get();
  const row = doc.exists ? (doc.data()?.[market] as { universe_id?: string } | undefined) : undefined;
  const fromState = String(row?.universe_id || "").trim();
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
