export type SeoPostMeta = {
  primaryKeyword: string;
  secondaryKeywords: string[];
  author: string;
  faqs: { question: string; answer: string }[];
};

export const seoPostMeta: Record<string, SeoPostMeta> = {
  "free-stock-market-analysis-tools": {
    primaryKeyword: "free stock market analysis tools",
    secondaryKeywords: [
      "best free stock analysis websites",
      "free stock market analysis software",
      "stock market tools free",
      "free stock research tools",
      "best free investing tools 2026",
    ],
    author: "Tarat",
    faqs: [
      { question: "What is the best free stock market analysis tool?", answer: "The best free tool depends on your needs. stocksbrew offers the best free daily market intelligence with AI-powered briefs. Finviz has the best free stock screener. TradingView offers the best free charting." },
      { question: "Are free stock analysis tools any good?", answer: "Yes. Free tools like stocksbrew, Finviz, and Yahoo Finance provide institution-grade data at zero cost. The tradeoff is usually delayed data or limited features, but for most individual investors, free tools cover 80% of what you need." },
      { question: "What is the best free AI stock analysis tool?", answer: "stocksbrew offers the best free AI-powered stock analysis with personalized daily briefs, watchlist radar, and signal scoring. The free tier is generous and doesn't require a credit card." },
      { question: "Can you do stock analysis for free?", answer: "Yes. You can combine stocksbrew for daily intelligence, Finviz for screening, TradingView for charting, and Yahoo Finance for portfolio tracking. This stack covers daily monitoring, research, and analysis at zero cost." },
    ],
    author: "Tarat",
  },
  "stock-research-busy-professionals": {
    primaryKeyword: "stock research for busy professionals",
    secondaryKeywords: [
      "daily stock research routine",
      "stock market analysis for working professionals",
      "how to research stocks with a full time job",
      "quick stock analysis routine",
      "investing while working full time",
    ],
    author: "Tarat",
    faqs: [
      { question: "How can busy professionals research stocks?", answer: "The key is automation. Use AI tools like stocksbrew for daily briefs, set brokerage alerts for 5%+ moves, and do a 15-minute weekly deep-dive on Sundays. Total time: 10 minutes per day." },
      { question: "What is the best stock research routine for working people?", answer: "A 10-minute daily routine: 5 minutes for an AI market brief in the morning, 2 minutes for a midday check, and 3 minutes for an evening review. Supplement with a 15-minute Sunday deep-dive weekly." },
      { question: "Do I need to check stocks every day?", answer: "You don't need to check prices every day, but you should review market intelligence daily. A daily brief takes 5 minutes and keeps you informed without the anxiety of watching price ticks." },
    ],
    author: "Tarat",
  },
  "ai-stock-analysis-comparison": {
    primaryKeyword: "AI stock analysis comparison",
    secondaryKeywords: [
      "best AI stock analysis tools 2026",
      "AI stock analysis tools compared",
      "Prospero vs Danelfin vs stocksbrew",
      "AI stock picker comparison",
      "stock analysis AI tools review",
    ],
    author: "Tarat",
    faqs: [
      { question: "Which AI stock analysis tool is best?", answer: "The best tool depends on your needs. stocksbrew is best for daily market intelligence with personalized briefs. Prospero is best for AI stock picks with a track record. TrendSpider is best for automated technical analysis." },
      { question: "Is AI stock analysis worth it?", answer: "Yes, when used correctly. AI is excellent at information processing, pattern recognition, and sentiment analysis. It's not good at predicting stock prices. Use AI for intelligence and monitoring, not for trading decisions." },
      { question: "How much do AI stock analysis tools cost?", answer: "Prices range from free (stocksbrew, Seeking Alpha basic) to $108/month (TrendSpider). Most quality tools fall in the $9-50/month range. Many offer free tiers that cover basic needs." },
    ],
    author: "Tarat",
  },
};

export function getSeoMeta(slug: string): SeoPostMeta | null {
  return seoPostMeta[slug] ?? null;
}
