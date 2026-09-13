import type { MarketSessionState } from "@/lib/market-session";

export const YOURTRACE_FEED = "https://yourtrace.online/feed";

export type MarketStatusSurface = "home" | "pulse" | "watchlist" | "stock";

export type MarketStatusBannerCopy = {
  badge: string;
  headline: string;
  cta: { label: string; href: string; external?: boolean };
  state: string;
};

function yourtraceUrl(campaign: "weekend" | "holiday") {
  const params = new URLSearchParams({
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
