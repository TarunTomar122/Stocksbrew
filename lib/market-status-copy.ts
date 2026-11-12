import type { MarketSessionState } from "@/lib/market-session";

export const YOURTRACE_FEED = "https://yourtrace.online/feed";

export type MarketStatusSurface = "home" | "pulse" | "watchlist" | "stock" | "floating";

export type MarketStatusBannerCopy = {
  badge: string;
  headline: string;
  /** Swapped in for a few seconds when the icon disc is poked. */
  quip?: string;
  cta: { label: string; href: string; external?: boolean };
  state: string;
};

function yourtraceUrl(campaign: "weekend" | "holiday") {
  const params = new URLSearchParams({
    q: "markets",
    utm_source: "stocksbrew",
    utm_medium: "market_status",
    utm_campaign: campaign,
  });
  return `${YOURTRACE_FEED}?${params.toString()}`;
}

export function getMarketStatusBannerCopy(session: MarketSessionState): MarketStatusBannerCopy | null {
  switch (session.kind) {
    case "weekend":
      if (session.weekday === "Sat") {
        return {
          badge: "Weekend",
          headline: "Markets are closed. Go touch some grass.",
          quip: "Ok. One more chart. Then grass.",
          cta: {
            label: "Want to be ready for Monday? Catch up on the news",
            href: yourtraceUrl("weekend"),
            external: true,
          },
          state: "weekend_saturday",
        };
      }
      if (session.weekday === "Sun") {
        return {
          badge: "Weekend",
          headline: "Still Sunday. Nothing's moving except the clock.",
          quip: "Still here? Respect. The market isn't.",
          cta: {
            label: "Monday prep: catch up on the news",
            href: yourtraceUrl("weekend"),
            external: true,
          },
          state: "weekend_sunday",
        };
      }
      return {
        badge: "Weekend",
        headline: "Markets are closed for the weekend.",
        quip: "Logging off is a valid strategy.",
        cta: {
          label: "Want to be ready for Monday? Catch up on the news",
          href: yourtraceUrl("weekend"),
          external: true,
        },
        state: "weekend_friday",
      };
    case "holiday":
      return {
        badge: "Market holiday",
        headline: `U.S. markets are closed for ${session.holidayName ?? "the holiday"}.`,
        quip: "Even the market takes the day off.",
        cta: {
          label: "Catch up on the news before the next session",
          href: yourtraceUrl("holiday"),
          external: true,
        },
        state: "holiday",
      };
    case "premarket":
      return {
        badge: "Pre-market",
        headline: `Market opens in ${session.countdown}`,
        cta: { label: "See what's already moving", href: "/pulse" },
        state: "premarket",
      };
    case "afterhours":
      return {
        badge: "After hours",
        headline: "That's a wrap.",
        quip: "Log off. The news will keep.",
        cta: { label: "Catch up on what moved today", href: "/pulse" },
        state: "afterhours",
      };
    default:
      return null;
  }
}

export function marketStatusStateLabel(session: MarketSessionState): string {
  return session.kind === "weekend" ? `weekend_${session.weekday.toLowerCase()}` : session.kind;
}

/**
 * The stock and fund header's session words, beside the price's own time ("Price at 3:59 PM ET"). Each says the
 * state now and counts to the next change that matters: while open, to the close, when after hours starts; after
 * the close, to the next open, said as the market's open so "After hours" is never read as the thing that opens.
 */
export function marketStatusInlineText(session: MarketSessionState): string {
  switch (session.kind) {
    case "open":
      return `Market open · closes in ${session.next.countdown}`;
    case "premarket":
      return `Premarket · market opens in ${session.countdown}`;
    case "afterhours":
      return `After hours · market opens in ${session.countdown}`;
    case "holiday":
      return `Closed for ${session.holidayName ?? "the holiday"} · opens in ${session.countdown}`;
    default:
      return `Market closed · opens in ${session.countdown}`;
  }
}

/** The tooltip under those words: when after hours starts while open, else the next opening bell. */
export function marketStatusInlineTip(session: MarketSessionState, nextOpenLabel: string): string {
  if (session.kind === "open") {
    const close = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(new Date(session.next.at));
    return `${session.earlyClose ? "Half day. " : ""}After hours from ${close} ET`;
  }
  return `Next open: ${nextOpenLabel}`;
}
