"use client";

import { useId } from "react";

type MiniSparklineProps = {
  values: number[];
  variant?: "line" | "bars";
  color?: "green" | "red" | "blue";
};

const LINE: Record<NonNullable<MiniSparklineProps["color"]>, { stroke: string; fillTop: string }> = {
  green: { stroke: "#2D6A4F", fillTop: "rgba(45, 106, 79, 0.10)" },
  red: { stroke: "#9B2226", fillTop: "rgba(155, 34, 38, 0.10)" },
  blue: { stroke: "#D4AF37", fillTop: "rgba(212, 175, 55, 0.10)" },
};

function barFill(color: string): string {
  switch (color) {
    case "green":
      return "bg-[#2D6A4F]/20";
    case "red":
      return "bg-[#9B2226]/20";
    default:
      return "bg-[#D4AF37]/20";
  }
}

export function MiniSparkline({ values, variant = "line", color = "blue" }: MiniSparklineProps) {
  const uid = useId().replace(/:/g, "");

  if (values.length === 0) {
    return null;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  if (variant === "bars") {
    const cls = barFill(color);
    return (
      <div className="flex h-10 w-full items-end gap-1">
        {values.map((value, index) => {
          const heightPct = 25 + ((value - min) / range) * 75;
          return (
            <div
              key={`${value}-${index}`}
              className={`${cls} w-full`}
              style={{ height: `${heightPct}%` }}
            />
          );
        })}
      </div>
    );
  }

  const points = values
    .map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * 1000;
      const y = 300 - ((value - min) / range) * 260 - 20;
      return `${x},${y}`;
    })
    .join(" ");

  const { stroke, fillTop } = LINE[color];
  const gradId = `spark-${uid}-${color}`;

  return (
    <svg viewBox="0 0 1000 300" preserveAspectRatio="none" className="h-full w-full" aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fillTop} stopOpacity="1" />
          <stop offset="100%" stopColor={fillTop} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={`0,300 ${points} 1000,300`} fill={`url(#${gradId})`} />
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
