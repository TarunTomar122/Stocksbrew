export type PillarInfo = { score: number; verdict: string };

export type VerdictApiResponse =
  | { state: "no_coverage" }
  | {
      state: "price_only";
      ticker: string;
      name: string;
      priceStr: string;
      priceChangeStr: string | null;
      logo_url?: string;
    }
  | {
      state: "full";
      ticker: string;
      stock: {
        name: string;
        priceStr: string;
        priceChangeStr: string | null;
        priceChange: number | null;
        logo_url?: string;
        sector?: string;
      };
      verdict: {
        level: string;
        headline: string;
        color: string;
        bg: string;
        textColor: string;
        reasons: string[];
      };
      pillars: {
        valuation: PillarInfo;
        growth: PillarInfo;
        quality: PillarInfo;
        momentum: PillarInfo;
      };
      rsi: number | null;
      overall: { score: number };
    };
