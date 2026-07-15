import Link from "next/link";
import { AnimatedIcon } from "@/components/animated-icon";
import { PRO_VALUE_PILLARS, PRO_WELCOME_STEPS } from "@/lib/subscribe-benefits";

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
            Your detailed calls, Stocksbrew targets, unlimited Radar, and alerts are active.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {PRO_VALUE_PILLARS.map((item) => (
            <div key={item.id} className="flex flex-col gap-2 rounded-2xl bg-[#fafafa] px-3.5 py-3">
              <AnimatedIcon name={item.icon} size={18} className="text-[#10b981]" aria-hidden />
              <span className="text-[12px] font-semibold leading-snug text-[#374151]">{item.shortTitle}</span>
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
            Build my Radar →
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
          Start with one stock. Then read its call and target, and choose the alerts that should bring you back.
        </p>
      </div>

      <div className="grid w-full grid-cols-1 gap-2 text-left">
        {PRO_WELCOME_STEPS.map((step, index) => (
          <Link
            key={step.title}
            href={step.href}
            className="flex items-start gap-3 rounded-2xl border border-[#e5e7eb] bg-white px-4 py-3 no-underline transition-colors hover:bg-[#fafafa]"
          >
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#111111] font-mono text-[11px] font-bold text-white">
              {index + 1}
            </span>
            <span>
              <span className="block text-[13px] font-semibold text-[#111111]">{step.title}</span>
              <span className="mt-0.5 block text-[12px] leading-relaxed text-[#6b7280]">{step.body}</span>
            </span>
          </Link>
        ))}
      </div>

      <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          href="/watchlist"
          className="inline-flex h-[50px] items-center justify-center rounded-full bg-[#111111] px-6 text-[14px] font-semibold text-white"
        >
          Build my Radar →
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
