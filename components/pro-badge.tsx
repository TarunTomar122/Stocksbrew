/**
 * Small inline badge that signals a Pro-only feature.
 * Renders nothing for subscribed users — call-site must pass isSubscribed.
 *
 * Usage:
 *   <h3>Section title <ProBadge /></h3>
 *   <ProBadge isSubscribed={isSubscribed} />   // hidden when subscribed
 */

type Props = {
  /** When true the badge is not rendered (user already has Pro). */
  isSubscribed?: boolean;
  /** Optionally override the label. Defaults to "PRO". */
  label?: string;
  /** Extra tailwind classes on the wrapper span. */
  className?: string;
};

export function ProBadge({ isSubscribed = false, label = "PRO", className = "" }: Props) {
  if (isSubscribed) return null;
  return (
    <span
      className={`inline-flex items-center gap-[3px] rounded-md px-[5px] py-[2px] text-[9px] font-bold uppercase tracking-[0.1em] bg-[#fef3c7] text-[#92400e] border border-[#fde68a] leading-none select-none ${className}`}
    >
      <svg width="7" height="9" viewBox="0 0 7 9" fill="none" aria-hidden>
        <path d="M3.5 0L4.6 3.2H8L5.2 5.1L6.3 8.3L3.5 6.4L0.7 8.3L1.8 5.1L-1 3.2H2.4L3.5 0Z" fill="#b45309"/>
      </svg>
      {label}
    </span>
  );
}
