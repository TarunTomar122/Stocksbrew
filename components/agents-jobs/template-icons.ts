import type { KindIconName } from "@/components/oa/nav-icon";

/** Each kind of agent has its own icon, wherever it is shown (owner VISUALS CHECK). Keyed by template id. */
export const TEMPLATE_ICON: Record<string, KindIconName> = {
  "morning-check": "today",
  "weekly-review": "briefing",
  "fund-filing": "briefcase",
  "congress-trade": "capitol",
  "insider-trade": "person",
  "earnings-ahead": "calendar",
  "earnings-out": "alerts",
  mover: "movers",
  "sec-filing": "filings",
  news: "news",
  "price-level": "tag",
  "big-move": "pulse",
  "buy-zone": "target",
  "sell-zone": "coins",
  "call-change": "research",
};
