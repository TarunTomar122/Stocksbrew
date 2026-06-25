export type SubscribeBenefit = {
  icon: string;
  title: string;
  body: string;
  href?: string;
  linkLabel?: string;
};

export type ProWelcomeStep = {
  title: string;
  body: string;
  href: string;
  linkLabel: string;
};

/** Shared copy for pricing, post-checkout welcome, and profile upsell. */
export const SUBSCRIBE_BENEFITS: SubscribeBenefit[] = [
  {
    icon: "radar",
    title: "Your full Radar",
    body: "Track every stock you care about.",
    href: "/watchlist",
    linkLabel: "Radar",
  },
  {
    icon: "verified",
    title: "The call",
    body: "Buy, hold, sell, or watch, with the reason.",
    href: "/watchlist",
    linkLabel: "Your Book",
  },
  {
    icon: "event_upcoming",
    title: "Before earnings",
    body: "Our read before the number drops.",
    href: "/events",
    linkLabel: "Events",
  },
  {
    icon: "hub",
    title: "Your book",
    body: "Crowding, overlap, and gaps in plain English.",
    href: "/watchlist",
    linkLabel: "Diagnosis on Radar",
  },
  {
    icon: "bolt",
    title: "Why it moved",
    body: "Big moves, Reddit, and news explained.",
    href: "/anomalies",
    linkLabel: "Top Movers",
  },
  {
    icon: "cancel",
    title: "Cancel anytime",
    body: "One click.",
  },
];

export const PRO_UNLOCKED_BENEFITS = SUBSCRIBE_BENEFITS.filter(
  (benefit) => benefit.title !== "Cancel anytime",
);

export const PRO_WELCOME_STEPS: ProWelcomeStep[] = [
  {
    title: "Add your stocks to Radar",
    body: "Search any ticker or upload a portfolio screenshot.",
    href: "/watchlist",
    linkLabel: "Open Radar",
  },
  {
    title: "Get the morning call on each name",
    body: "Buy, hold, sell, or watch, with the reason.",
    href: "/watchlist",
    linkLabel: "See your Book",
  },
  {
    title: "Turn on alerts for what matters",
    body: "Earnings, big moves, and setup changes in your inbox.",
    href: "/profile",
    linkLabel: "Profile settings",
  },
];

/** Short, account-aware lines for the subscribe checkout card. */
export type SubscribeContextLine = { emoji: string; text: string };

export function buildSubscribeContextLines(trackedCount: number): SubscribeContextLine[] {
  const count = Math.max(0, trackedCount);
  const stockWord = count === 1 ? "stock" : "stocks";

  if (count >= 3) {
    return [
      {
        emoji: "🎯",
        text: `Full calls on all ${count} names already on your Radar — lift the 3-stock free cap.`,
      },
      { emoji: "📚", text: "Add the rest of your book without swapping tickers in and out." },
      { emoji: "🔔", text: "Morning digest + alerts tuned to what you actually hold." },
      { emoji: "📅", text: "Pre-earnings setups and move reads on every name you track." },
    ];
  }

  if (count > 0) {
    return [
      {
        emoji: "🎯",
        text: `Our add · hold · trim call on the ${count} ${stockWord} already on your Radar.`,
      },
      { emoji: "📈", text: "Track more names without hitting the free 3-stock wall." },
      { emoji: "☀️", text: "Morning digest and smart alerts for your book." },
      { emoji: "📅", text: "Pre-earnings setups before the print on holdings you care about." },
    ];
  }

  return [
    { emoji: "📡", text: "Track your whole portfolio on Radar — free stops at 3 stocks." },
    { emoji: "🎯", text: "A clear add · hold · trim call on every name you add." },
    { emoji: "🔔", text: "Morning digest and alerts when setups shift on your book." },
    { emoji: "📊", text: "Pre-earnings intel and move reads before you need them." },
  ];
}
