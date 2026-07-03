import { AnimatedIcon } from "@/components/animated-icon";
import Link from "next/link";
import { ProBadge } from "@/components/pro-badge";

type Props = {
  setupCount: number;
  isSubscribed: boolean;
};

export function UpcomingEarningsCallout({ setupCount, isSubscribed }: Props) {
  const countLine =
    setupCount > 0
      ? `${setupCount} ${setupCount === 1 ? "company" : "companies"} reporting in the next 7 days`
      : "Fresh setups added as names enter the 7-day window";

  const pitchLine = isSubscribed
    ? "Your AI predictions on EPS and the stock move — read them before the market reacts."
    : "Pro unlocks pre-earnings predictions on EPS and the stock move so you can position ahead of the print.";

  return (
    <Link
      href="/upcoming-events"
      className="group flex items-start gap-3 rounded-xl border border-[#fde68a] bg-gradient-to-r from-[#fffbeb] via-[#fff7ed] to-white px-4 py-3.5 transition-all hover:border-[#f59e0b] hover:shadow-sm"
    >
      <span
        aria-hidden
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-[#b45309] ring-1 ring-[#fde68a] mt-0.5"
      >
        <AnimatedIcon name="event_upcoming" size={16} aria-hidden />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[13px] font-semibold text-[#111111] group-hover:text-[#b45309] transition-colors">
            Upcoming earnings
          </span>
          {!isSubscribed ? (
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-[#111111] text-white"
              >
                <AnimatedIcon name="lock" size={13} aria-hidden />
              </span>
              <ProBadge isSubscribed={false} />
            </span>
          ) : null}
          <span className="text-[12px] font-medium text-[#b45309]">{countLine}</span>
        </div>
        <p
          className={`text-[12px] leading-snug ${
            isSubscribed ? "text-[#374151]" : "text-[#92400e] font-medium"
          }`}
        >
          {pitchLine}
        </p>
      </div>
      <AnimatedIcon
        name="arrow_forward"
        size={18}
        className="shrink-0 text-[#9ca3af] group-hover:text-[#b45309] transition-colors mt-0.5"
        aria-hidden
      />
    </Link>
  );
}
