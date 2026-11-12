import type { NavIcon as NavIconName } from "@/components/oa/nav-items";

const PATHS: Record<NavIconName, string[]> = {
  today: ["M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"],
  alerts: ["M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9Z", "M10 19a2 2 0 0 0 4 0"],
  research: ["M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Z", "m16 16 5 5", "M7.5 12.5 10 10l2 2 2.5-3"],
  briefing: ["M5 3h14v18l-3-2-2.5 2-2-2-2.5 2-2-2-2 2V3Z", "M9 9h6M9 13h4"],
  portfolio: ["M3 10 12 4l9 6", "M5 10v8M9.5 10v8M14.5 10v8M19 10v8", "M3 20h18"],
  explore: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "m15.5 8.5-2 5-5 2 2-5 5-2Z"],
  follow: ["M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z", "M2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5", "M16 4.4a3.5 3.5 0 0 1 0 6.2", "M18.5 14.9c1.6.8 2.7 2.5 3 5.1"],
  agents: ["M12 3v3", "M6 6h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z", "M9 11v2M15 11v2", "M9 21h6"],
  markets: ["M3 20h18", "M6 16v-5M11 16V6M16 16v-8M21 16v-3"],
  // A sun on the horizon: the hours before the open (the full sun is Today).
  premarket: ["M3 18h18", "M7 18a5 5 0 0 1 10 0", "M12 6.5V9", "M5.6 10.6 7 12", "M18.4 10.6 17 12", "M8 21h8"],
  // A tray: what came in for you (the bell is Alerts).
  inbox: ["M5.5 5h13L21 13v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5l2.5-8Z", "M3 13h5l1.5 2.5h5L16 13h5"],
  strategies: ["M4 6h10M4 12h16M4 18h7", "M17 6h3M14 18h6"],
  backtest: ["M3 12a9 9 0 1 0 3-6.7", "M3 4v4.5h4.5", "M12 7.5V12l3 2"],
  calendar: ["M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z", "M4 10h16M8 3v4M16 3v4"],
  news: ["M5 4h11v16H6a2 2 0 0 1-2-2V5a1 1 0 0 1 1-1Z", "M16 9h4v9a2 2 0 0 1-2 2", "M8 8h5M8 12h5M8 16h3"],
  filings: ["M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z", "M14 3v5h5", "M9 13h6M9 17h6"],
  ask: ["M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-6l-4.5 3.5V17H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z", "M8 10h8M8 13h5"],
  screener: ["M4 5h16l-6 7.5V19l-4-2v-4.5L4 5Z"],
  themes: ["M12 3 3 8l9 5 9-5-9-5Z", "m3 12.5 9 5 9-5", "m3 17 9 5 9-5"],
  signals: ["M4 18v-3M9 18V9M14 18v-6M19 18V5"],
  movers: ["M7 20V5", "m3.5 8.5 3.5-3.5 3.5 3.5", "M17 4v15", "m13.5 15.5 3.5 3.5 3.5-3.5"],
  sectors: ["M12 3a9 9 0 1 0 9 9h-9V3Z", "M15 3.5A9 9 0 0 1 20.5 9H15V3.5Z"],
  compare: ["M8 4v16M16 4v16", "M4 8h8M12 16h8"],
  docs: ["M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Z", "M17 20h2V7", "M8.5 9h5M8.5 13h5"],
  practice: ["M4 7h16v12H4z", "M4 11h16", "M8 15h3"],
  api: ["m8 8-4 4 4 4", "m16 8 4 4-4 4", "m13.5 5-3 14"],
};

export function NavIcon({ name, className = "size-[18px]" }: { name: NavIconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

/**
 * Icons for kinds of things that are not places: calendar event types, news topics, filing forms, asset classes,
 * list groups, kinds of investor. Same line style as the nav. Owner rule (VISUALS CHECK): any list of kinds carries its
 * icon, and each icon names the thing, so it is never the same mark on every row of one list.
 */
const KIND_PATHS = {
  // Money paid out: a stack of coins.
  coins: ["M9 14a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z", "M18.1 10.4A6 6 0 1 1 10.4 18.1", "M7 6h1v4", "m16.7 13.9.7.7-2.8 2.8"],
  // The economy: a globe.
  globe: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M3 12h18", "M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9Z"],
  // A new listing or share offering: a rocket.
  rocket: [
    "M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 0 0-2.9-.1Z",
    "m12 15-3-3a22 22 0 0 1 2-4A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22.4 22.4 0 0 1-4 2Z",
    "M9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0",
    "M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5",
  ],
  // An analyst's rating: a star.
  star: ["M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"],
  // Mergers: two paths joining.
  merge: ["M6 3v6a6 6 0 0 0 6 6h0a6 6 0 0 1 6 6", "M18 3v6a6 6 0 0 1-6 6", "M3 6l3-3 3 3", "M15 6l3-3 3 3"],
  // Policy and rules: a balance.
  scale: ["M12 3v18", "M7 21h10", "M4 7h16", "m6 7-3 7a3.5 3.5 0 0 0 6 0L6 7", "m18 7-3 7a3.5 3.5 0 0 0 6 0l-3-7"],
  // A product: a box.
  box: ["M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3Z", "M4 7.5l8 4.5 8-4.5", "M12 12v9"],
  // A fund: a briefcase.
  briefcase: ["M4 8h16v11H4z", "M9 8V5h6v3", "M4 13h16"],
  // Congress: the columns of a capitol.
  capitol: ["M3 21h18", "M5 21v-9M9.5 21v-9M14.5 21v-9M19 21v-9", "M3 12h18L12 5 3 12Z"],
  // A company insider: one person.
  person: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M4.5 21c.8-3.8 3.8-6 7.5-6s6.7 2.2 7.5 6"],
  // Rates: a percent sign.
  percent: ["M19 5 5 19", "M6.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z", "M17.5 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"],
  // Commodities: a drop of oil.
  drop: ["M12 3c3.5 4 6 7.2 6 10.5a6 6 0 0 1-12 0C6 10.2 8.5 7 12 3Z"],
  // Currencies: two arrows trading places.
  exchange: ["M4 8h13", "m14 5 3 3-3 3", "M20 16H7", "m10 13-3 3 3 3"],
  // Crypto: a hexagon block.
  block: ["M12 2.5 20.5 7.5v9L12 21.5 3.5 16.5v-9L12 2.5Z", "M12 7.5 16.5 10v5L12 17.5 7.5 15v-5L12 7.5Z"],
  // Options and volatility: a pulse.
  pulse: ["M3 12h4l3-8 4 16 3-8h4"],
  // Prediction markets: a target.
  target: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z", "M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"],
  // Growth: a line going up.
  growth: ["m3 17 6-6 4 4 8-8", "M15 7h6v6"],
  // A price: a tag.
  tag: ["M3 12V4h8l10 10-8 8L3 12Z", "M7.5 8.5h.01"],
  // Industries: a factory.
  factory: ["M3 20V10l5 3V10l5 3V6h4l1 14H3zM3 20h18"],
  // An annual report: a closed book.
  book: ["M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V4Z", "M5 18a2 2 0 0 1 2-2h11", "M9 8h5"],
  // When something updates: a clock face.
  clock: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M12 7.5V12l3 2"],
  // Dismiss: a cross.
  close: ["M6 6l12 12", "M18 6 6 18"],
} satisfies Record<string, string[]>;

export type KindIconName = NavIconName | keyof typeof KIND_PATHS;

export function KindIcon({ name, className = "size-4" }: { name: KindIconName; className?: string }) {
  const paths = name in KIND_PATHS ? KIND_PATHS[name as keyof typeof KIND_PATHS] : PATHS[name as NavIconName];
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
