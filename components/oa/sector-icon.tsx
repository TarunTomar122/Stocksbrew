import * as React from "react";

/**
 * One small line drawing per sector, shared by every place a sector is named (the market sectors heatmap, Analysis,
 * fund pages). Owner, Nov 12: sectors need icons wherever they are listed. Look up by sector fund id ("xlk") or by
 * name ("Technology", "Health Care", "Consumer Cyclical"...).
 */

const ICON_PATHS: Record<string, React.ReactNode> = {
  // Technology: a chip.
  xlk: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
      <path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" />
    </>
  ),
  // Financials: a bank.
  xlf: <path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" />,
  // Energy: a lightning bolt.
  xle: <path d="M13 3L5 14h6l-1 7 8-11h-6l1-7z" />,
  // Health care: a cross.
  xlv: <path d="M9.5 4h5v5.5H20v5h-5.5V20h-5v-5.5H4v-5h5.5z" />,
  // Industrials: a factory.
  xli: <path d="M3 20V10l5 3V10l5 3V6h4l1 14H3zM3 20h18" />,
  // Consumer discretionary: a shopping bag.
  xly: (
    <>
      <path d="M5 8h14l-1 12H6L5 8z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </>
  ),
  // Consumer staples: a basket.
  xlp: <path d="M3 10h18l-2 9H5l-2-9zM8 10l3-6M16 10l-3-6M9 13v3M15 13v3" />,
  // Utilities: a light bulb.
  xlu: <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />,
  // Materials: a cube.
  xlb: <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zM4 7.5l8 4.5 8-4.5M12 12v9" />,
  // Real estate: a house.
  xlre: <path d="M4 11l8-7 8 7M6 9.5V20h12V9.5M10 20v-5h4v5" />,
  // Communication services: a speech bubble.
  xlc: <path d="M4 5h16v11H9l-5 4V5z" />,
};

const BY_NAME: Record<string, string> = {
  technology: "xlk",
  "information technology": "xlk",
  financials: "xlf",
  "financial services": "xlf",
  energy: "xle",
  "health care": "xlv",
  healthcare: "xlv",
  industrials: "xli",
  "consumer discretionary": "xly",
  "consumer cyclical": "xly",
  "consumer staples": "xlp",
  "consumer defensive": "xlp",
  utilities: "xlu",
  materials: "xlb",
  "basic materials": "xlb",
  "real estate": "xlre",
  "communication services": "xlc",
};

/** The icon id for a sector fund id or a sector name, or null when we have no drawing for it. */
export function sectorIconId(idOrName: string): string | null {
  const key = idOrName.trim().toLowerCase();
  if (ICON_PATHS[key]) return key;
  return BY_NAME[key] ?? null;
}

export function SectorIcon({ id, size = 16, className = "" }: { id: string; size?: number; className?: string }) {
  const icon = sectorIconId(id);
  const paths = icon ? ICON_PATHS[icon] : null;
  if (!paths) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 text-oa-fg opacity-80 ${className}`}
    >
      {paths}
    </svg>
  );
}
