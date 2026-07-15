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

export type ProValuePillar = {
  id: "calls" | "target" | "radar";
  icon: string;
  title: string;
  shortTitle: string;
  body: string;
};

/** The three outcomes every Pro surface should sell and explain. */
export const PRO_VALUE_PILLARS: ProValuePillar[] = [
  {
    id: "calls",
    icon: "verified",
    title: "Detailed calls and zones",
    shortTitle: "Calls and zones",
    body: "See the add, hold, or trim call, the buy and trim zones, plus the drivers and risks behind it.",
  },
  {
    id: "target",
    icon: "flag",
    title: "The Stocksbrew target price",
    shortTitle: "Target price",
    body: "See our target price and the room from today's price, with the evidence that can move it.",
  },
  {
    id: "radar",
    icon: "notifications_active",
    title: "Radar tracking and alerts",
    shortTitle: "Radar and alerts",
    body: "Track every stock you care about. Get automatic earnings and zone alerts, or set your own price alert.",
  },
];

/** Shared copy for pricing, post-checkout welcome, and profile upsell. */
export const SUBSCRIBE_BENEFITS: SubscribeBenefit[] = [
  {
    icon: "verified",
    title: "Detailed calls and zones",
    body: "Add, hold, or trim, with buy zones, trim zones, drivers, and risks.",
    href: "/stock/NVDA",
    linkLabel: "See a stock call",
  },
  {
    icon: "flag",
    title: "Stocksbrew target price",
    body: "Our target, the room from today, and what would change the case.",
    href: "/stock/NVDA",
    linkLabel: "See a target",
  },
  {
    icon: "notifications_active",
    title: "Radar and alerts",
    body: "Unlimited tracking, automatic earnings and zone alerts, plus manual price alerts.",
    href: "/watchlist",
    linkLabel: "Open Radar",
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
    title: "Build your Radar",
    body: "Add the stocks you own and the stocks you are waiting to buy.",
    href: "/watchlist",
    linkLabel: "Open Radar",
  },
  {
    title: "Read the call and target",
    body: "Open any tracked stock for its zones, drivers, risks, and Stocksbrew target price.",
    href: "/watchlist",
    linkLabel: "See your stocks",
  },
  {
    title: "Choose your alerts",
    body: "Keep automatic earnings and zone alerts on, or set a manual price alert on any stock.",
    href: "/profile",
    linkLabel: "Alert settings",
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
      { icon: "verified", text: `Detailed calls, zones, drivers, and risks on all ${count} names.` },
      { icon: "flag", text: "Stocksbrew target prices with room from today." },
      { icon: "radar", text: "Add the rest of your book without the 3-stock cap." },
      { icon: "notifications_active", text: "Automatic earnings and zone alerts, plus manual alerts." },
    ];
  }

  if (count > 0) {
    return [
      { icon: "verified", text: `Detailed calls and zones on the ${count} ${stockWord} on your Radar.` },
      { icon: "flag", text: "Stocksbrew target prices with upside or downside context." },
      { icon: "radar", text: "Track more names without hitting the free limit." },
      { icon: "notifications_active", text: "Automatic earnings and zone alerts, plus manual alerts." },
    ];
  }

  return [
    { icon: "verified", text: "Detailed calls, buy and trim zones, drivers, and risks." },
    { icon: "flag", text: "Stocksbrew target prices with room from today." },
    { icon: "radar", text: "Track every stock you own or watch on Radar." },
    { icon: "notifications_active", text: "Automatic earnings and zone alerts, plus manual alerts." },
  ];
}

/** One-line trust chips under the CTA. */
export const SUBSCRIBE_TRUST_STRIP: Array<{ icon: string; label: string; href?: string }> = [
  { icon: "sync_alt", label: "7-day refund" },
  { icon: "lock", label: "Secure checkout" },
  { icon: "support_agent", label: "Human support", href: `mailto:${SUBSCRIBE_SUPPORT_EMAIL}` },
  { icon: "cancel", label: "Cancel anytime" },
];
