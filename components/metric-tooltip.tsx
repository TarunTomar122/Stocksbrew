type Props = {
  title: string;
  body: string;
};

export function MetricTooltip({ title, body }: Props) {
  return (
    <span className="relative inline-flex items-center group">
      <button
        type="button"
        aria-label={`About ${title}`}
        className="w-3.5 h-3.5 inline-flex items-center justify-center rounded-full text-[10px] font-semibold text-[#9ca3af] hover:text-[#111111] transition-colors cursor-help"
        tabIndex={0}
      >
        ⓘ
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute z-30 bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-max max-w-[220px] rounded-lg bg-[#111111] text-white px-2.5 py-1.5 text-[12px] leading-snug font-medium opacity-0 invisible group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 transition-opacity shadow-md whitespace-normal"
      >
        {body}
      </span>
    </span>
  );
}

export const METRIC_HELP: Record<string, { title: string; body: string }> = {
  "P/E TTM": {
    title: "P/E (trailing)",
    body: "Price ÷ last-12-mo earnings. Lower = cheaper.",
  },
  "Forward P/E": {
    title: "Forward P/E",
    body: "Price ÷ next-year expected earnings.",
  },
  PEG: {
    title: "PEG",
    body: "P/E ÷ growth. Under 1 is cheap, over 2 is rich.",
  },
  "Analyst target": {
    title: "Analyst target",
    body: "Avg 12-mo price target. Bar shows upside vs price.",
  },
  "Revenue growth (TTM)": {
    title: "Revenue growth",
    body: "YoY sales growth. >15% solid, >25% strong.",
  },
  "EPS growth (TTM)": {
    title: "EPS growth",
    body: "YoY earnings-per-share growth.",
  },
  "EPS forecast (5Y)": {
    title: "5Y EPS forecast",
    body: "Analyst CAGR for next 5 years of earnings.",
  },
  "EPS next year": {
    title: "Next-year EPS",
    body: "Consensus EPS growth for next fiscal year.",
  },
  "EPS growth (Q/Q)": {
    title: "Quarterly EPS growth",
    body: "Latest quarter's EPS vs prior quarter.",
  },
  ROE: {
    title: "Return on Equity",
    body: "Profit ÷ equity. >15% solid, >20% excellent.",
  },
  "Operating margin": {
    title: "Operating margin",
    body: "Operating profit ÷ revenue. Higher = pricing power.",
  },
  "Payout ratio": {
    title: "Payout ratio",
    body: "% of earnings paid as dividends. <60% is comfortable.",
  },
  "Debt / Equity": {
    title: "Debt / Equity",
    body: "Leverage. Lower is safer; >2 is heavy.",
  },
  "Institutional ownership": {
    title: "Institutional ownership",
    body: "% held by funds. Higher = more smart-money.",
  },
  "Quant rank": {
    title: "Quant rank",
    body: "1 = Strong Buy, 5 = Strong Sell.",
  },
  "Beat likelihood": {
    title: "Beat likelihood",
    body: "Forecast of beating consensus EPS next quarter.",
  },
  "Analyst rating": {
    title: "Analyst rating",
    body: "Avg broker rec. 1 = Buy, 3 = Hold, 5 = Sell.",
  },
  "Short float": {
    title: "Short float",
    body: "% of shares sold short. >10% = bears positioned.",
  },
  "Insider activity": {
    title: "Insider activity",
    body: "Net insider buys/sells over last 6 months.",
  },
  "1-month performance": {
    title: "1-month return",
    body: "Total return over last 30 days.",
  },
  "RSI (14)": {
    title: "RSI (14)",
    body: ">70 overbought, <30 oversold.",
  },
  "Analyst consensus": {
    title: "Analyst consensus",
    body: "% of analysts rating it Buy.",
  },
  "1-week performance": {
    title: "1-week return",
    body: "Total return over last 7 days.",
  },
  "1-year performance": {
    title: "1-year return",
    body: "Total return over last 12 months.",
  },
  "5-year CAGR": {
    title: "5Y price CAGR",
    body: "Annualized price return over 5 years.",
  },
  "Revenue CAGR (3Y)": {
    title: "3Y revenue CAGR",
    body: "Annualized sales growth over 3 years.",
  },
  "Revenue CAGR (5Y)": {
    title: "5Y revenue CAGR",
    body: "Annualized sales growth over 5 years.",
  },
  "Profit CAGR (3Y)": {
    title: "3Y profit CAGR",
    body: "Annualized profit growth over 3 years.",
  },
  "Profit CAGR (5Y)": {
    title: "5Y profit CAGR",
    body: "Annualized profit growth over 5 years.",
  },
  "Profit CAGR (10Y)": {
    title: "10Y profit CAGR",
    body: "Annualized profit growth over a decade.",
  },
};
