"use client";

import type { ComponentType, HTMLAttributes } from "react";

import * as Icons from "@/components/icons";
import { MATERIAL_TO_LUCIDE, lucideFileToExportName } from "@/lib/icon-map";

type IconComponent = ComponentType<
  HTMLAttributes<HTMLDivElement> & {
    size?: number;
  }
>;

type AnimatedIconProps = {
  /** Material symbol name (e.g. trending_up) or lucide kebab name (trending-up). */
  name: string;
  size?: number;
  className?: string;
} & Omit<HTMLAttributes<HTMLDivElement>, "children">;

function resolveLucideName(name: string): string {
  const normalized = name.trim();
  if (MATERIAL_TO_LUCIDE[normalized]) return MATERIAL_TO_LUCIDE[normalized];
  if (normalized.includes("_")) return normalized.replace(/_/g, "-");
  return normalized;
}

export function AnimatedIcon({ name, size = 18, className, ...props }: AnimatedIconProps) {
  const lucideName = resolveLucideName(name);
  const exportName = lucideFileToExportName(lucideName);
  const registry = Icons as Record<string, IconComponent | undefined>;
  const IconComponent = registry[exportName];

  if (!IconComponent) {
    return (
      <span
        aria-hidden
        className={className}
        style={{ width: size, height: size, display: "inline-block" }}
        {...props}
      />
    );
  }

  return <IconComponent size={size} className={className} {...props} />;
}

/** @deprecated Use AnimatedIcon — kept for drop-in migration from Material Symbols spans. */
export function AppIcon({
  icon,
  size = 18,
  className,
  ...props
}: {
  icon: string;
  size?: number;
  className?: string;
} & Omit<HTMLAttributes<HTMLDivElement>, "children">) {
  return <AnimatedIcon name={icon} size={size} className={className} {...props} />;
}
