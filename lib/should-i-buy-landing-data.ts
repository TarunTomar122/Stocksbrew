export const SHOULD_I_BUY_FAQS = [
  {
    question: "Is stocksbrew Should I Buy really free?",
    answer:
      "Yes. Run Should I Buy on any US ticker without paying. Watchlist tracking is free for up to 3 stocks; Pro adds unlimited names and alerts.",
  },
  {
    question: "How is this different from a price alert?",
    answer:
      "Should I Buy synthesizes fundamentals, news, Reddit, earnings, and price action into a buy/hold/avoid style read. Price alerts only fire when a number crosses a line.",
  },
  {
    question: "Do I need an account?",
    answer:
      "You can try Should I Buy without signing in. Sign in to add the ticker to Watchlist for ongoing research and alerts.",
  },
  {
    question: "What tickers are supported?",
    answer: "US-listed equities with sufficient coverage in our data. If a ticker has limited data, we will tell you instead of guessing.",
  },
  {
    question: "Is this investment advice?",
    answer:
      "No. stocksbrew is research and education only, not a broker and not personalized investment advice.",
  },
];

export const SHOULD_I_BUY_STEPS = [
  {
    title: "Enter a US ticker",
    body: "Type any symbol or pick from popular names. No account required for your first run.",
  },
  {
    title: "See pillar scores and synthesis",
    body: "Valuation, growth, quality, and momentum roll into a clear signal with context on catalysts and risks.",
  },
  {
    title: "Add it to Watchlist if you want to keep following it",
    body: "Sign in to track up to 3 names free. Pro unlocks unlimited Watchlist and email alerts.",
  },
];

export const SHOULD_I_BUY_STACK = [
  { name: "Should I Buy", href: "/should-i-buy", role: "Vet new ideas before you commit" },
  { name: "Compare Stocks", href: "/compare-stocks", role: "Line up the pick against its peers" },
  { name: "Watchlist", href: "/watchlist", role: "Ongoing research on the stocks you follow (3 free)" },
  { name: "Portfolio Analyzer", href: "/portfolio", role: "Concentration and overlap check" },
  { name: "Earnings Intel", href: "/earnings-intel", role: "Post-print read on reporting names" },
];

export const SHOULD_I_BUY_VS_ROWS = [
  { label: "Free US ticker lookup", stocksbrew: "Yes", other: "Varies by screener" },
  { label: "Narrative call", stocksbrew: "AI synthesis + pillars", other: "Tables and filters" },
  { label: "Ongoing monitoring", stocksbrew: "Watchlist + email alerts", other: "Usually separate product" },
  { label: "Time to first answer", stocksbrew: "Under a minute", other: "Manual interpretation" },
];
