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
export type SubscribeContextLine = { icon: string; text: string };

export type SubscribeTrustItem = {
  icon: string;
  title: string;
  body: string;
  href?: string;
};

export const SUBSCRIBE_SUPPORT_EMAIL = "tomartarun2001@gmail.com";

export const SUBSCRIBE_TRUST_ITEMS: SubscribeTrustItem[] = [
  {
    icon: "sync_alt",
    title: "7-day full refund",
    body: "Try Pro for a week. If it's not useful, email us and we'll refund you. No hoops.",
  },
  {
    icon: "support_agent",
    title: "Talk to a human",
    body: "Questions before you pay? We read every message.",
    href: `mailto:${SUBSCRIBE_SUPPORT_EMAIL}`,
  },
  {
    icon: "lock",
    title: "Secure checkout",
    body: "Card details handled by Dodo Payments. We never store them.",
  },
  {
    icon: "cancel",
    title: "Cancel anytime",
    body: "One click in Profile. No annual lock-in on monthly.",
  },
];

export function buildSubscribeContextLines(trackedCount: number): SubscribeContextLine[] {
  const count = Math.max(0, trackedCount);
  const stockWord = count === 1 ? "stock" : "stocks";

  if (count >= 3) {
    return [
      { icon: "radar", text: `Full calls on all ${count} names, past the 3-stock free cap.` },
      { icon: "inventory_2", text: "Add the rest of your book without swapping tickers." },
      { icon: "notifications", text: "Morning digest + alerts tuned to your holdings." },
      { icon: "event_upcoming", text: "Pre-earnings reads and move intel on your book." },
    ];
  }

  if (count > 0) {
    return [
      { icon: "verified", text: `Add · hold · trim on the ${count} ${stockWord} on your Radar.` },
      { icon: "show_chart", text: "Track more names without hitting the free limit." },
      { icon: "wb_twilight", text: "Morning digest + alerts when setups shift." },
      { icon: "event_upcoming", text: "Pre-earnings setups on names you care about." },
    ];
  }

  return [
    { icon: "radar", text: "Track your whole portfolio on Radar. Free stops at 3 stocks." },
    { icon: "verified", text: "A clear add · hold · trim call on every name." },
    { icon: "notifications", text: "Morning digest and alerts when setups shift." },
    { icon: "monitoring", text: "Pre-earnings intel before you need it." },
  ];
}

/** One-line trust chips under the CTA — titles only, no paragraph blocks. */
export const SUBSCRIBE_TRUST_STRIP: Array<{ icon: string; label: string; href?: string }> = [
  { icon: "sync_alt", label: "7-day refund" },
  { icon: "lock", label: "Secure checkout" },
  { icon: "support_agent", label: "Human support", href: `mailto:${SUBSCRIBE_SUPPORT_EMAIL}` },
  { icon: "cancel", label: "Cancel anytime" },
];
