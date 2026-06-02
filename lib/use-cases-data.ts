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
      "Monitor dividend holdings on Radar, catch guidance changes after earnings, and stay ahead of ex-dates with a weekly digest.",
    pain:
      "Income investors need to know when a payout is at risk, when guidance shifts, and when ex-dates approach. Reading every filing is not realistic.",
    steps: [
      { text: "Add dividend holdings to Radar as holdings.", href: "/watchlist", linkLabel: "Open Radar" },
      { text: "Read AI briefs for trim or hold signals after earnings." },
      { text: "Sync your list to the earnings calendar.", href: "/earnings", linkLabel: "Earnings calendar" },
      { text: "Enable email digest on your profile for weekly call changes.", href: "/profile", linkLabel: "Profile settings" },
    ],
    features: [
      { name: "Radar", href: "/watchlist", description: "Daily directives on each income name" },
      { name: "Earnings Intel", href: "/earnings-intel", description: "Post-print guidance read-throughs" },
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
          "Radar briefs and the earnings calendar flag upcoming report and catalyst windows. Enable email digest so you do not have to check daily.",
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
      "Scan Heat and Screens for ideas, run Should I Buy before sizing up, and track setups on Radar with Pro alerts.",
    pain:
      "Swing traders need fast idea flow, a quick quality check before entry, and alerts when price or narrative invalidates the trade.",
    steps: [
      { text: "Scan Market Heat and Screens for unusual attention.", href: "/heat", linkLabel: "Market Heat" },
      { text: "Run Should I Buy before adding size to a new name.", href: "/should-i-buy", linkLabel: "Should I Buy" },
      { text: "Track as watching on Radar and set Pro price triggers.", href: "/watchlist", linkLabel: "Add to Radar" },
      { text: "Review news timeline when an alert fires.", href: "/news", linkLabel: "News" },
    ],
    features: [
      { name: "Market Heat", href: "/heat", description: "Sector and theme momentum at a glance" },
      { name: "Screens", href: "/screens", description: "Thematic lists updated with the market" },
      { name: "Should I Buy", href: "/should-i-buy", description: "Fast scorecard before you commit" },
      { name: "Radar alerts", href: "/subscribe", description: "Pro triggers when setup shifts" },
    ],
    faqs: [
      {
        question: "Is stocksbrew a charting platform?",
        answer: "No. Pair Radar with your charting tool. stocksbrew handles the narrative read and alerts; you handle entries and exits.",
      },
      {
        question: "How fast can I vet a new ticker?",
        answer: "Should I Buy returns pillar scores and a synthesis in under a minute. Add to Radar if you want ongoing briefs.",
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
    headline: "Know report dates and the post-print so what without ten tabs open",
    description:
      "Use Earnings Intel for AI briefs, sync Radar to the calendar, and get flags on names reporting in the next five sessions.",
    pain:
      "Earnings season means scattered dates, surprise guidance, and post-print moves you need to interpret quickly across a watchlist.",
    steps: [
      { text: "Add reporting names to Radar before the week starts.", href: "/watchlist", linkLabel: "Radar" },
      { text: "Check the earnings calendar against your list.", href: "/earnings", linkLabel: "Calendar" },
      { text: "Read Earnings Intel for pre- and post-print context.", href: "/earnings-intel", linkLabel: "Earnings Intel" },
      { text: "Enable digest email so call changes land in your inbox.", href: "/profile", linkLabel: "Profile" },
    ],
    features: [
      { name: "Earnings Intel", href: "/earnings-intel", description: "AI post-earnings briefs per ticker" },
      { name: "Earnings calendar", href: "/earnings", description: "Dates synced to your workflow" },
      { name: "Radar", href: "/watchlist", description: "Flags names reporting soon" },
      { name: "Should I Buy", href: "/should-i-buy", description: "Re-score after a big print" },
    ],
    faqs: [
      {
        question: "Does Earnings Intel cover every US stock?",
        answer: "Coverage expands with reports. Add tickers to Radar and check Earnings Intel for published briefs on your names.",
      },
      {
        question: "Can I prep before the report?",
        answer: "Yes. Radar briefs include upcoming catalyst context. Read Earnings Intel after the print for the structured so-what.",
      },
      {
        question: "How is this different from a earnings calendar app?",
        answer: "Calendars show dates. stocksbrew adds AI read-throughs and ties them to your watchlist directives and alerts.",
      },
    ],
  },
];

export function getUseCase(slug: string): UseCase | undefined {
  return USE_CASES.find((u) => u.slug === slug);
}
