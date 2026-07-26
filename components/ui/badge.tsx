import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// shadcn/ui Badge, themed on stocksbrew tokens. Colors stay disciplined:
// brand = purple, bull/bear = data only, everything else neutral.
const badgeVariants = cva(
  "inline-flex items-center rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums transition-colors",
  {
    variants: {
      variant: {
        neutral: "bg-surface-container text-on-surface-variant",
        brand: "bg-primary/10 text-primary",
        bull: "bg-[color-mix(in_srgb,var(--signal-bullish)_12%,var(--surface))] text-[var(--signal-bullish)]",
        bear: "bg-[color-mix(in_srgb,var(--signal-bearish)_12%,var(--surface))] text-[var(--signal-bearish)]",
        outline: "border border-outline-variant text-on-surface",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
