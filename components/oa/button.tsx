import * as React from "react";

/**
 * The OA button: a pill that physically presses. The press
 * (`active:translate-y-px active:scale-[0.98]`) is the only geometry change
 * a pointer causes anywhere in this system. A loading button keeps its label
 * and gains a ring spinner beside it, so its width never jumps.
 */

type Variant = "primary" | "outline" | "secondary" | "ghost";
type Size = "md" | "sm" | "xs";

const RING =
  "focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)] outline-none";

const BASE =
  "inline-flex cursor-pointer items-center justify-center gap-1 whitespace-nowrap font-medium outline-none transition-all " +
  RING +
  " disabled:pointer-events-none disabled:opacity-50 " +
  "active:translate-y-px active:scale-[0.98]";

const VARIANTS: Record<Variant, string> = {
  primary:
    "border border-[color-mix(in_srgb,var(--oa-primary)_80%,#3a3480)] " +
    "bg-[color-mix(in_srgb,var(--oa-primary)_90%,#3a3480)] text-oa-primary-fg " +
    "shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-1px_0_rgba(58,52,128,0.30)] " +
    "hover:bg-oa-primary hover:border-[color-mix(in_srgb,var(--oa-primary)_70%,#3a3480)]",
  // The stand-in for a filled button when the view already has its one filled copper element.
  outline: "oa-btn-outline",
  secondary:
    "border border-oa-border bg-oa-secondary text-oa-secondary-fg " +
    "hover:bg-[color-mix(in_srgb,var(--oa-secondary)_95%,var(--ink))]",
  ghost: "text-oa-muted-fg hover:text-oa-fg",
};

const SIZES: Record<Size, string> = {
  md: "h-9 rounded-lg px-3 py-1.5 text-sm",
  sm: "h-8 rounded-lg gap-1.5 px-3 text-sm",
  xs: "h-7 rounded-lg px-2 text-[13px]",
};

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-label="Loading"
      role="status"
      className={`inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent ${className ?? ""}`}
    />
  );
}

export interface OaButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export function OaButton({
  className,
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  children,
  type,
  ...props
}: OaButtonProps) {
  return (
    <button
      className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className ?? ""}`}
      disabled={loading || disabled}
      aria-disabled={loading || undefined}
      type={type ?? "button"}
      {...props}
    >
      {loading ? <Spinner className="pointer-events-none size-3.5" /> : null}
      {children}
    </button>
  );
}
