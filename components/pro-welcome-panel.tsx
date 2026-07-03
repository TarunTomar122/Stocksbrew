import Link from "next/link";
import { AnimatedIcon } from "@/components/animated-icon";

type Props = {
  variant?: "page" | "modal";
  onDismiss?: () => void;
};

export function ProWelcomePanel({ variant = "page", onDismiss }: Props) {
  const isModal = variant === "modal";

  if (isModal) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#ecfdf5] px-2.5 py-1 text-[11px] font-semibold tracking-[0.08em] uppercase text-[#047857]">
            <span aria-hidden>★</span>
            Pro active
          </span>
          <h2 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-[#111111]">
            You&apos;re on Pro.
          </h2>
          <p className="max-w-md text-[14px] leading-relaxed text-[#6b7280]">
            Your Radar now has full calls, move reads, Reddit/news signals, and portfolio diagnosis.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[
            "Full calls on your stocks",
            "Why big moves happened",
            "Reddit and news reads",
            "Portfolio diagnosis",
          ].map((item) => (
            <div key={item} className="flex items-center gap-2 rounded-2xl bg-[#fafafa] px-3.5 py-3 text-[13px] font-semibold text-[#374151]">
              <AnimatedIcon name="check_circle" size={18} className="text-[#10b981]" aria-hidden />
              {item}
            </div>
          ))}
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {onDismiss ? (
            <button
              type="button"
              onClick={onDismiss}
              className="inline-flex h-[42px] items-center justify-center rounded-full border border-[#111111] px-5 text-[13px] font-semibold text-[#111111]"
            >
              Close
            </button>
          ) : null}
          <Link
            href="/watchlist"
            className="inline-flex h-[42px] items-center justify-center rounded-full bg-[#111111] px-5 text-[13px] font-semibold text-white"
          >
            Open Radar →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[560px] flex-col items-center gap-5 text-center">
      <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#ecfdf5] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#047857]">
        <span aria-hidden>★</span>
        Pro active
      </span>
      <div className="flex flex-col gap-2">
        <h2 className="text-[30px] font-semibold leading-tight tracking-[-0.02em] text-[#111111] md:text-[38px]">
          You&apos;re in.
        </h2>
        <p className="text-[15px] leading-relaxed text-[#6b7280]">
          Pro is active on your account. Open Radar to see the full read on your stocks.
        </p>
      </div>

      <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          href="/watchlist"
          className="inline-flex h-[50px] items-center justify-center rounded-full bg-[#111111] px-6 text-[14px] font-semibold text-white"
        >
          Open Radar →
        </Link>
        <Link
          href="/"
          className="inline-flex h-[50px] items-center justify-center rounded-full border border-[#d1d5db] px-6 text-[14px] font-semibold text-[#111111]"
        >
          Browse stocks
        </Link>
      </div>
    </div>
  );
}
