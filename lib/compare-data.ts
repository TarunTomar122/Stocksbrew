export type ComparisonRow = {
  dimension: string;
  stocksbrew: string;
  competitor: string;
};

export type ComparisonPage = {
  slug: string;
  competitorName: string;
  title: string;
  description: string;
  verdict: string;
  competitorUrl: string;
  competitorPricingUrl?: string;
  stocksbrewBestFor: string;
  competitorBestFor: string;
  bothScenario: string;
  rows: ComparisonRow[];
  stocksbrewStrengths: string[];
  competitorStrengths: string[];
  workflow: { title: string; body: string }[];
  faqs: { question: string; answer: string }[];
};

export const COMPARISON_PAGES: ComparisonPage[] = [
  {
    slug: "stocksbrew-vs-tickertape",
    competitorName: "Tickertape",
    title: "stocksbrew vs Tickertape",
    description:
      "Honest comparison for US vs Indian market research. Tickertape excels at Indian screeners; stocksbrew gives US watchlist calls, Should I Buy, and Radar alerts.",
    verdict:
      "Tickertape is built for Indian retail: screeners, smallcases, and NSE/BSE data. stocksbrew is built for US equities: daily buy/hold/sell calls on your Radar and email when setups change.",
    competitorUrl: "https://www.tickertape.in",
    competitorPricingUrl: "https://www.tickertape.in/pricing",
    stocksbrewBestFor:
      "You hold US stocks and want a daily call on each name, plus email when something matters instead of another tab to refresh.",
    competitorBestFor:
      "You invest primarily in Indian equities, live in screeners, and want smallcase and mutual fund discovery in one Indian-native app.",
    bothScenario:
      "Screen Indian ideas on Tickertape and track US execution on Radar. Many investors use both markets with different tools.",
    rows: [
      { dimension: "Primary market", stocksbrew: "US equities", competitor: "India (NSE/BSE)" },
      { dimension: "Core output", stocksbrew: "Buy / hold / sell call per tracked ticker", competitor: "Screens, scores, market data" },
      { dimension: "Watchlist intelligence", stocksbrew: "Radar briefs + daily digest", competitor: "Stock pages + screener exports" },
      { dimension: "Alerts", stocksbrew: "Email on buy/sell zones (Pro)", competitor: "Price and news alerts (plan-dependent)" },
      { dimension: "Free tier", stocksbrew: "3 Radar stocks, Should I Buy, Earnings Intel", competitor: "Free tier on tickertape.in" },
      { dimension: "Paid entry", stocksbrew: "Pro ~$9/mo unlimited Radar", competitor: "See Tickertape pricing page" },
    ],
    stocksbrewStrengths: [
      "Clear US watchlist directives on Radar",
      "Free Should I Buy scorecard on any US ticker",
      "Earnings Intel and news tied to your names",
      "Email alerts when a setup shifts (Pro)",
    ],
    competitorStrengths: [
      "Deep Indian market screeners and stock scores",
      "Smallcase and mutual fund workflows",
      "Large library of investing tutorials",
      "Strong coverage of NSE/BSE names",
    ],
    workflow: [
      {
        title: "Monday: set Radar",
        body: "Add holdings and watchlist names to Radar (free for 3 stocks). Each ticker gets an AI directive with rationale from fundamentals, news, Reddit, and earnings.",
      },
      {
        title: "Tuesday–Thursday: let alerts work",
        body: "Pro users set triggers; email fires when price or setup crosses a zone. You get context on why it matters, not just a price ping.",
      },
      {
        title: "Friday: cross-check new ideas",
        body: "Run Should I Buy on any new ticker. Scan Market Heat for unusual attention. Read Earnings Intel before weekend homework.",
      },
    ],
    faqs: [
      {
        question: "Is stocksbrew a Tickertape alternative?",
        answer:
          "For US equities and personalized buy/hold/sell calls on your watchlist, yes. Tickertape focuses on Indian markets, screeners, and smallcases. stocksbrew focuses on Radar, AI directives, and email alerts for US stocks.",
      },
      {
        question: "Does Tickertape work for US stocks?",
        answer:
          "Tickertape is built primarily for Indian retail investors. stocksbrew is built for US equities with Radar, Should I Buy, and earnings intel tied to your holdings.",
      },
      {
        question: "Which is better for watchlist alerts?",
        answer:
          "stocksbrew sends email alerts when a tracked stock moves into a buy or sell zone and refreshes AI briefs on Radar. Tickertape emphasizes screeners and market data for Indian tickers rather than personalized US portfolio calls.",
      },
      {
        question: "How much does each cost?",
        answer:
          "stocksbrew is free for 3 Radar stocks; Pro is $9/month. Tickertape offers free and paid tiers on tickertape.in; see their pricing page for current plans.",
      },
      {
        question: "Can I use both tools together?",
        answer:
          "Yes. Many investors screen on one platform and track decisions on another. Use Tickertape for Indian market screens and stocksbrew for US watchlist calls and alerts.",
      },
    ],
  },
];

export function getComparisonPage(slug: string): ComparisonPage | undefined {
  return COMPARISON_PAGES.find((p) => p.slug === slug);
}
