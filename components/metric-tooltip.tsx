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
        className="w-3.5 h-3.5 inline-flex items-center justify-center rounded-full border border-outline-variant text-[9px] font-bold text-on-surface-variant hover:text-on-surface hover:border-on-surface transition-colors cursor-help"
        tabIndex={0}
      >
        i
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute z-20 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-on-surface text-surface-container-lowest p-3 text-[11px] leading-snug font-normal opacity-0 invisible group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 transition-opacity shadow-lg"
      >
        <span className="block text-[10px] font-bold uppercase tracking-[0.14em] opacity-70 mb-1">
          {title}
        </span>
        <span className="block">{body}</span>
      </span>
    </span>
  );
}

export const METRIC_HELP: Record<string, { title: string; body: string }> = {
  "P/E TTM": {
    title: "Price / Earnings (trailing)",
    body: "Price per share divided by the last 12 months of earnings. Lower vs. sector = cheaper relative to what the company actually earned. High P/E means investors are paying up — usually for growth expectations.",
  },
  "Forward P/E": {
    title: "Forward P/E",
    body: "Price divided by next-year expected earnings. Shows how the market prices the stock against what analysts think it'll earn going forward. Below-sector is a discount, above-sector is a premium.",
  },
  PEG: {
    title: "PEG Ratio",
    body: "P/E divided by expected earnings growth. Under 1 = growth is cheap, 1–2 = fairly priced, over 2 = heavy growth already priced in. Best valuation lens for growth stocks.",
  },
  "Analyst target": {
    title: "Analyst price target",
    body: "The average 12-month price target from sell-side analysts. The bar shows implied upside or downside vs. the current price.",
  },
  "Revenue growth (TTM)": {
    title: "Revenue growth (trailing 12M)",
    body: "How much sales grew year-over-year. Above 15% is solid, above 25% is strong. The top-line engine — if this is stalling, growth investors get nervous.",
  },
  "EPS growth (TTM)": {
    title: "EPS growth (trailing 12M)",
    body: "How much earnings per share grew year-over-year. Outpacing revenue growth is a sign of expanding margins or buybacks.",
  },
  "EPS forecast (5Y)": {
    title: "5-year EPS CAGR forecast",
    body: "Analyst consensus for compound annual earnings growth over the next 5 years. The single best forward growth signal — drives PEG too.",
  },
  "EPS next year": {
    title: "Next-year EPS growth",
    body: "Consensus estimate for how much EPS grows next fiscal year vs. this one. Near-term visibility on the growth story.",
  },
  "EPS growth (Q/Q)": {
    title: "Quarterly EPS growth",
    body: "Most recent quarter's EPS vs. prior quarter. Catches acceleration or deceleration before it shows up in annual numbers.",
  },
  ROE: {
    title: "Return on Equity",
    body: "Net income divided by shareholder equity. Measures how efficiently the company turns invested capital into profit. Above 15% is solid, above 20% is excellent.",
  },
  "Operating margin": {
    title: "Operating margin",
    body: "Operating profit as a percent of revenue. Shows pricing power and cost discipline — steady or expanding margins = durable business.",
  },
  "Payout ratio": {
    title: "Dividend payout ratio",
    body: "Percent of earnings paid out as dividends. Under 60% is comfortable; above 80% means little room to grow the dividend or weather a downturn.",
  },
  "Debt / Equity": {
    title: "Debt / Equity",
    body: "Total debt divided by equity. Lower is safer. Above 2.0 signals heavy leverage — fine for some industries (utilities, banks) but risky elsewhere.",
  },
  "Institutional ownership": {
    title: "Institutional ownership",
    body: "Percent of shares held by funds, pensions, and other institutions. Higher = more smart-money validation and deeper liquidity.",
  },
  "Quant rank": {
    title: "Quant rank (1–5)",
    body: "Short-term rating based on earnings estimate revisions. 1 = Strong Buy, 2 = Buy, 3 = Hold, 4 = Sell, 5 = Strong Sell. A powerful momentum signal — upgrades tend to precede price moves.",
  },
  "Beat likelihood": {
    title: "Beat likelihood",
    body: "A forecast of whether the company will beat or miss consensus EPS this upcoming quarter. Positive = beat-likely, negative = miss-likely. Strong predictor of post-earnings price action.",
  },
  "Analyst rating": {
    title: "Analyst consensus rating",
    body: "Mean sell-side broker recommendation on a 1–5 scale. 1 = Strong Buy, 3 = Hold, 5 = Strong Sell.",
  },
  "Short float": {
    title: "Short float",
    body: "Percent of tradable shares sold short. Under 5% is calm, over 10% means bears are positioned — can fuel squeezes on good news or accelerate selloffs.",
  },
  "Insider activity": {
    title: "Insider transactions (6M)",
    body: "Net percent of shares bought or sold by executives and directors over the last 6 months. Insiders buying = conviction; selling alone isn't always bearish (diversification, taxes).",
  },
  "1-month performance": {
    title: "1-month price performance",
    body: "Total return over the last 30 days. Short-term momentum — strong recent moves tend to persist, but overextended moves mean-revert.",
  },
  "RSI (14)": {
    title: "RSI (14-day)",
    body: "Relative Strength Index. 50–65 is healthy uptrend, above 70 is overbought (pullback risk), below 30 is oversold (bounce setup).",
  },
  "Analyst consensus": {
    title: "Analyst consensus (% buy)",
    body: "Share of covering sell-side analysts rating the stock a buy. Above 70% is strong conviction, below 40% means the street is split or bearish.",
  },
  "1-week performance": {
    title: "1-week price performance",
    body: "Total return over the last 7 days. Very short-term momentum — noisy on its own, useful as a tiebreaker alongside the 1-month move.",
  },
  "1-year performance": {
    title: "1-year price performance",
    body: "Total return over the trailing 12 months. Captures how the stock has done through a full cycle of earnings and macro shifts.",
  },
  "5-year CAGR": {
    title: "5-year price CAGR",
    body: "Compounded annualized price return over 5 years. Long-run track record — above 15% is multibagger pace, below 5% is a muted compounder.",
  },
  "Revenue CAGR (3Y)": {
    title: "Revenue CAGR (3-year)",
    body: "Compounded annualized revenue growth over the last 3 years. A recent-track-record view of how fast the top line is scaling.",
  },
  "Revenue CAGR (5Y)": {
    title: "Revenue CAGR (5-year)",
    body: "Compounded annualized revenue growth over 5 years. The durability test — consistent double-digit CAGR signals a structural growth story.",
  },
  "Profit CAGR (3Y)": {
    title: "Profit CAGR (3-year)",
    body: "Compounded annualized net profit growth over 3 years. Outpacing revenue CAGR means margins are expanding; lagging means they're compressing.",
  },
  "Profit CAGR (5Y)": {
    title: "Profit CAGR (5-year)",
    body: "Compounded annualized net profit growth over 5 years. The cleanest read on whether earnings power is compounding through cycles.",
  },
  "Profit CAGR (10Y)": {
    title: "Profit CAGR (10-year)",
    body: "Compounded annualized net profit growth over a decade. The long-run durability check — businesses that sustain this are rare.",
  },
};
