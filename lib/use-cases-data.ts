export type UseCaseStep = {
  text: string;
  href?: string;
  linkLabel?: string;
};

export type UseCaseFeature = {
  name: string;
  href: string;
  description: string;
};

export type UseCase = {
  slug: string;
  title: string;
  headline: string;
  description: string;
  pain: string;
  steps: UseCaseStep[];
  features: UseCaseFeature[];
  faqs: { question: string; answer: string }[];
};

export const USE_CASES: UseCase[] = [
  {
    slug: "dividend-investing",
    title: "Dividend & income investing",
    headline: "Track payout safety without reading every press release",
    description:
      "Monitor dividend holdings in Watchlist, catch guidance changes after earnings and keep upcoming dates together.",
    pain:
      "Income investors need to know when a payout is at risk, when guidance shifts, and when ex-dates approach. Reading every filing is not realistic.",
    steps: [
      { text: "Add dividend holdings to Watchlist as holdings.", href: "/watchlist", linkLabel: "Open Watchlist" },
      { text: "Read the AI brief after earnings to see what changed." },
      { text: "Sync your list to the earnings calendar.", href: "/earnings", linkLabel: "Earnings calendar" },
      { text: "Enable email digest on your profile for weekly call changes.", href: "/profile", linkLabel: "Profile settings" },
    ],
    features: [
      { name: "Watchlist", href: "/watchlist", description: "Research and alerts for each income stock" },
      { name: "Earnings Intel", href: "/earnings-intel", description: "What changed after the report" },
      { name: "Should I Buy", href: "/should-i-buy", description: "Score new yield ideas before adding" },
      { name: "News timeline", href: "/news", description: "Filter headlines to your holdings" },
    ],
    faqs: [
      {
        question: "Can stocksbrew replace a dividend screener?",
        answer:
          "stocksbrew is not a screener. Use it to monitor names you already own or are considering, with AI briefs and alerts instead of static yield tables.",
      },
      {
        question: "How do I track ex-dates?",
        answer:
          "Watchlist research and the earnings calendar flag upcoming reports and catalyst windows. Enable the email digest so you do not have to check daily.",
      },
      {
        question: "Is this for US dividend stocks?",
        answer: "Yes. stocksbrew focuses on US equities today, including REITs and dividend payers listed on US exchanges.",
      },
    ],
  },
  {
    slug: "swing-trading",
    title: "Swing trading setups",
    headline: "Find movers, score entry quality, get pinged when the thesis breaks",
    description:
      "Scan Heat and Screens for ideas, run Should I Buy before sizing up and track the stocks in Watchlist with Pro alerts.",
    pain:
      "Swing traders need fast idea flow, a quick quality check before entry, and alerts when price or narrative invalidates the trade.",
    steps: [
      { text: "Scan Market Heat and Screens for unusual attention.", href: "/heat", linkLabel: "Market Heat" },
      { text: "Run Should I Buy before adding size to a new name.", href: "/should-i-buy", linkLabel: "Should I Buy" },
      { text: "Add it to Watchlist as watching and set Pro price triggers.", href: "/watchlist", linkLabel: "Add to Watchlist" },
      { text: "Review news timeline when an alert fires.", href: "/news", linkLabel: "News" },
    ],
    features: [
      { name: "Market Heat", href: "/heat", description: "Sector and theme momentum at a glance" },
      { name: "Screens", href: "/screens", description: "Thematic lists updated with the market" },
      { name: "Should I Buy", href: "/should-i-buy", description: "Fast scorecard before you commit" },
      { name: "Watchlist alerts", href: "/subscribe", description: "Pro alerts for important changes" },
    ],
    faqs: [
      {
        question: "Is stocksbrew a charting platform?",
        answer: "No. Pair Watchlist with your charting tool. Stocksbrew handles the company research and alerts; you handle entries and exits.",
      },
      {
        question: "How fast can I vet a new ticker?",
        answer: "Should I Buy returns pillar scores and a current call in under a minute. Add it to Watchlist for ongoing research.",
      },
      {
        question: "Do alerts work for intraday moves?",
        answer: "Pro alerts focus on meaningful setup changes and zones, not every tick. Email fires when the thesis shifts.",
      },
    ],
  },
  {
    slug: "earnings-season",
    title: "Earnings season prep",
    headline: "Keep report dates and earnings research in one place",
    description:
      "Use Earnings Intel for post-results research, sync Watchlist to the calendar and see which names report in the next five sessions.",
    pain:
      "Earnings season brings scattered dates, changed guidance, and new filings across every stock you follow.",
    steps: [
      { text: "Add reporting names to Watchlist before the week starts.", href: "/watchlist", linkLabel: "Watchlist" },
      { text: "Check the earnings calendar against your list.", href: "/earnings", linkLabel: "Calendar" },
      { text: "Read Earnings Intel before and after the report.", href: "/earnings-intel", linkLabel: "Earnings Intel" },
      { text: "Enable digest email so call changes land in your inbox.", href: "/profile", linkLabel: "Profile" },
    ],
    features: [
      { name: "Earnings Intel", href: "/earnings-intel", description: "AI earnings research for each ticker" },
      { name: "Earnings calendar", href: "/earnings", description: "Dates synced to your workflow" },
      { name: "Watchlist", href: "/watchlist", description: "Flags names reporting soon" },
      { name: "Should I Buy", href: "/should-i-buy", description: "Re-score after a big print" },
    ],
    faqs: [
      {
        question: "Does Earnings Intel cover every US stock?",
        answer: "Coverage expands with reports. Add tickers to Watchlist and check Earnings Intel for published research on your names.",
      },
      {
        question: "Can I prep before the report?",
        answer: "Yes. Watchlist briefs include upcoming catalyst context. Read Earnings Intel after the report to see what changed.",
      },
      {
        question: "How is this different from a earnings calendar app?",
        answer: "Calendars show dates. stocksbrew adds AI read-throughs and ties them to your watchlist directives and alerts.",
      },
    ],
  },
  {
    slug: "long-term-investing",
    title: "Long-term buy-and-hold investing",
    headline: "Monitor your holdings without the daily noise",
    description:
      "Track long-term positions in Watchlist, get weekly digests and hear when fundamentals change.",
    pain:
      "Long-term investors don't want to check stocks daily. But they still need to know when something fundamentally changes — a guidance cut, a management shakeup, or a competitive threat.",
    steps: [
      { text: "Add your core holdings to Watchlist.", href: "/watchlist", linkLabel: "Open Watchlist" },
      { text: "Enable weekly email digest instead of daily.", href: "/profile", linkLabel: "Profile settings" },
      { text: "Read Earnings Intel quarterly to track thesis evolution.", href: "/earnings-intel", linkLabel: "Earnings Intel" },
      { text: "Run Should I Buy annually to re-evaluate each position.", href: "/should-i-buy", linkLabel: "Should I Buy" },
    ],
    features: [
      { name: "Watchlist", href: "/watchlist", description: "Weekly calls on each long-term holding" },
      { name: "Earnings Intel", href: "/earnings-intel", description: "Quarterly thesis check after earnings" },
      { name: "Should I Buy", href: "/should-i-buy", description: "Annual re-evaluation scorecard" },
      { name: "Pulse", href: "/pulse", description: "Catch unusual attention on your names" },
    ],
    faqs: [
      {
        question: "Do I need to check stocksbrew daily?",
        answer: "No. Set your digest to weekly. stocksbrew will only email you when something meaningful changes for your holdings — a directive shift, an earnings event, or a sentiment change.",
      },
      {
        question: "Is stocksbrew useful for buy-and-hold investors?",
        answer: "Yes. The value is knowing when something changes. You don't need daily updates on stocks you plan to hold for years, but you do need to know when the thesis breaks.",
      },
      {
        question: "How often should I re-evaluate my positions?",
        answer: "Quarterly after earnings, or whenever stocksbrew flags a directive change. Annual rebalancing is sufficient for most long-term portfolios.",
      },
    ],
  },
  {
    slug: "day-trading",
    title: "Day trading and active trading",
    headline: "See the overnight moves before the market opens",
    description:
      "Use Premarket for overnight moves, Market Heat for momentum scanning and Watchlist for the stocks you want to keep following.",
    pain:
      "Active traders need fast pre-market context, momentum scanning, and alerts when a setup changes.",
    steps: [
      { text: "Check Premarket before the open for overnight movers.", href: "/premarket", linkLabel: "Premarket" },
      { text: "Scan Market Heat during the day for sector momentum.", href: "/heat", linkLabel: "Market Heat" },
      { text: "Run Should I Buy on watchlist candidates before entry.", href: "/should-i-buy", linkLabel: "Should I Buy" },
      { text: "Track active names in Watchlist with Pro price triggers.", href: "/watchlist", linkLabel: "Watchlist" },
    ],
    features: [
      { name: "Premarket", href: "/premarket", description: "Overnight moves and gap analysis" },
      { name: "Market Heat", href: "/heat", description: "Sector and theme momentum in real time" },
      { name: "Should I Buy", href: "/should-i-buy", description: "Fast conviction check before sizing up" },
      { name: "Screens", href: "/screens", description: "Thematic screens for idea flow" },
    ],
    faqs: [
      {
        question: "Does stocksbrew provide real-time data?",
        answer: "Stocksbrew explains the market and the stocks you follow. Use your brokerage for live execution and order data.",
      },
      {
        question: "Can stocksbrew replace my charting platform?",
        answer: "No. stocksbrew provides the narrative — what's happening and why. Charting platforms provide the price action. Use both together for a complete picture.",
      },
      {
        question: "How fast is pre-market data?",
        answer: "Premarket briefs update with overnight developments including earnings, analyst changes, and news. Check it before the open for context on what to watch.",
      },
    ],
  },
  {
    slug: "retirement-planning",
    title: "Retirement portfolio management",
    headline: "Monitor your retirement holdings with a weekly 5-minute brief",
    description:
      "Track retirement positions in Watchlist, follow payout safety and get a weekly digest.",
    pain:
      "Retirement investors need income stability and capital preservation. They don't want to monitor stocks daily, but they can't afford to miss a dividend cut or a fundamental deterioration in a core holding.",
    steps: [
      { text: "Add your retirement holdings to Watchlist.", href: "/watchlist", linkLabel: "Open Watchlist" },
      { text: "Enable weekly email digest.", href: "/profile", linkLabel: "Profile settings" },
      { text: "Sync holdings to the earnings calendar.", href: "/earnings", linkLabel: "Earnings calendar" },
      { text: "Run Should I Buy on any new dividend stock ideas.", href: "/should-i-buy", linkLabel: "Should I Buy" },
    ],
    features: [
      { name: "Watchlist", href: "/watchlist", description: "Weekly calls on retirement holdings" },
      { name: "Earnings Intel", href: "/earnings-intel", description: "Post-earnings context for income stocks" },
      { name: "Should I Buy", href: "/should-i-buy", description: "Score new income ideas before adding" },
      { name: "Pulse", href: "/pulse", description: "Catch unusual attention on your names" },
    ],
    faqs: [
      {
        question: "Is stocksbrew good for retirement portfolios?",
        answer: "Yes. Set a weekly digest and let stocksbrew monitor your holdings. You'll get an email when something meaningful changes — a directive shift, an earnings event, or a sentiment change that warrants attention.",
      },
      {
        question: "Can stocksbrew track dividend income?",
        answer: "stocksbrew tracks dividend-related signals in daily briefs including ex-dates and payout safety indicators. For detailed dividend income tracking, pair with a tool like Sharesight.",
      },
      {
        question: "How often should I check my retirement portfolio?",
        answer: "Weekly is sufficient for most retirement investors. stocksbrew's weekly digest covers any meaningful changes. Quarterly deep-dives around earnings season add an extra layer of diligence.",
      },
    ],
  },
];

export function getUseCase(slug: string): UseCase | undefined {
  return USE_CASES.find((u) => u.slug === slug);
}
