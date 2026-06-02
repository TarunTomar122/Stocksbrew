import { adminFirestore } from "@/lib/firebase-admin";

export type PortfolioExposure = {
  uid: string;
  generated_at?: string;
  concentration?: {
    top1_pct?: number;
    top3_pct?: number;
    hhi?: number;
    risk_label?: string;
  };
  sector_weights?: Array<{
    sector?: string;
    weight?: number;
  }>;
  weight_recommendations?: Array<{
    ticker?: string;
    directive?: string;
    weight?: number;
    weight_target_range?: {
      min?: number;
      max?: number;
    };
    rebalance_note?: string;
  }>;
};

export type PortfolioScenario = {
  uid: string;
  title?: string;
  generated_at?: string;
  scenarios?: Array<{
    case?: string;
    label?: string;
    market_mood?: string;
    actions?: string[];
    impacts?: Array<{
      ticker?: string;
      direction?: string;
      estimated_move_pct?: number;
      confidence?: string;
      driver?: string;
    }>;
  }>;
};

export async function getPortfolioExposure(uid: string): Promise<PortfolioExposure | null> {
  const doc = await adminFirestore.collection("tm_portfolio_exposure").doc(uid).get();
  if (!doc.exists) return null;
  return doc.data() as PortfolioExposure;
}

export async function getPortfolioScenario(
  uid: string,
  scenarioId = "US__nvda_earnings",
): Promise<PortfolioScenario | null> {
  const doc = await adminFirestore
    .collection("tm_portfolio_scenarios")
    .doc(uid)
    .collection("events")
    .doc(scenarioId)
    .get();
  if (!doc.exists) return null;
  return doc.data() as PortfolioScenario;
}

