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
  strategies: ["M4 6h10M4 12h16M4 18h7", "M17 6h3M14 18h6"],
  backtest: ["M3 12a9 9 0 1 0 3-6.7", "M3 4v4.5h4.5", "M12 7.5V12l3 2"],
  calendar: ["M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z", "M4 10h16M8 3v4M16 3v4"],
  news: ["M5 4h11v16H6a2 2 0 0 1-2-2V5a1 1 0 0 1 1-1Z", "M16 9h4v9a2 2 0 0 1-2 2", "M8 8h5M8 12h5M8 16h3"],
  filings: ["M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z", "M14 3v5h5", "M9 13h6M9 17h6"],
  ask: ["M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-6l-4.5 3.5V17H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z", "M8 10h8M8 13h5"],
  screener: ["M4 5h16l-6 7.5V19l-4-2v-4.5L4 5Z"],
  themes: ["M12 3 3 8l9 5 9-5-9-5Z", "m3 12.5 9 5 9-5", "m3 17 9 5 9-5"],
  signals: ["M4 18v-3M9 18V9M14 18v-6M19 18V5"],
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
