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
