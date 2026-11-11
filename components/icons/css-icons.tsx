import type { CSSProperties, HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

/**
 * The sun, sun-moon and moon icons with the same paths and hover play as the
 * motion versions in this folder, done in CSS (globals.css, `.sb-ic-*`). They
 * sit in the market tab and the footer's theme switch, which are on every
 * page, so they must not pull the motion library into every page's JS.
 */

type CssIconName = "sun" | "sun-moon" | "moon";

type CssIconProps = { name: CssIconName; size?: number } & Omit<HTMLAttributes<HTMLDivElement>, "children">;

const SUN_RAYS = ["M12 2v2", "m19.07 4.93-1.41 1.41", "M20 12h2", "m17.66 17.66 1.41 1.41", "M12 20v2", "m6.34 17.66-1.41 1.41", "M2 12h2", "m4.93 4.93 1.41 1.41"];
const SUN_MOON_RAYS = ["M12 2v2", "M12 20v2", "m4.9 4.9 1.4 1.4", "m17.7 17.7 1.4 1.4", "M2 12h2", "M20 12h2", "m6.3 17.7-1.4 1.4", "m19.1 4.9-1.4 1.4"];

function Rays({ paths }: { paths: string[] }) {
  return (
    <>
      {paths.map((d, index) => (
        <path key={d} d={d} className="sb-ic-ray" style={{ "--sb-ic-i": index + 1 } as CSSProperties} />
      ))}
    </>
  );
}

export function CssIcon({ name, size = 28, className, ...props }: CssIconProps) {
  const svg = {
    fill: "none",
    height: size,
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: "2",
    viewBox: "0 0 24 24",
    width: size,
    xmlns: "http://www.w3.org/2000/svg",
  };
  return (
    <div className={cn("sb-ic", className)} {...props}>
      {name === "sun" ? (
        <svg {...svg}>
          <circle cx="12" cy="12" r="4" />
          <Rays paths={SUN_RAYS} />
        </svg>
      ) : name === "sun-moon" ? (
        <svg {...svg}>
          <g className="sb-ic-wobble-soft">
            <path d="M12 8a2.83 2.83 0 0 0 4 4 4 4 0 1 1-4-4" />
          </g>
          <Rays paths={SUN_MOON_RAYS} />
        </svg>
      ) : (
        <svg {...svg} className="sb-ic-wobble">
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
      )}
    </div>
  );
}
