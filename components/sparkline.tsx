"use client";

import { useId } from "react";

type SparklineProps = {
  values: number[];
  tone?: "green" | "red" | "neutral";
  height?: number;
  filled?: boolean;
  className?: string;
  strokeWidth?: number;
};

const SPARK_STROKE: Record<NonNullable<SparklineProps["tone"]>, string> = {
  green: "#22C55E",
  red: "#EF4444",
  neutral: "#8C94A8",
};

const SPARK_FILL: Record<NonNullable<SparklineProps["tone"]>, string> = {
  green: "rgba(34, 197, 94, 0.18)",
  red: "rgba(239, 68, 68, 0.18)",
  neutral: "rgba(140, 148, 168, 0.12)",
};

export function Sparkline({
  values,
  tone = "neutral",
  height = 40,
  filled = true,
  className = "",
  strokeWidth = 2,
}: SparklineProps) {
  const uid = useId().replace(/:/g, "");
  if (!values || values.length < 2) {
    return <div style={{ height }} className={className} />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 1000;
      const y = 300 - ((value - min) / range) * 260 - 20;
      return `${x},${y}`;
    })
    .join(" ");
  const stroke = SPARK_STROKE[tone];
  const fill = SPARK_FILL[tone];
  const gradId = `sparkv2-${uid}-${tone}`;

  return (
    <svg
      viewBox="0 0 1000 300"
      preserveAspectRatio="none"
      className={`w-full ${className}`}
      style={{ height }}
      aria-hidden="true"
    >
      {filled && (
        <>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={fill} stopOpacity="1" />
              <stop offset="100%" stopColor={fill} stopOpacity="0" />
            </linearGradient>
          </defs>
          <polyline points={`0,300 ${points} 1000,300`} fill={`url(#${gradId})`} />
        </>
      )}
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
