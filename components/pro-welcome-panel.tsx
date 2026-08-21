import Link from "next/link";
import { PRO_VALUE_PILLARS, PRO_WELCOME_STEPS } from "@/lib/subscribe-benefits";

type Props = {
  variant?: "page" | "modal";
  onDismiss?: () => void;
};

const PRIMARY_LINK =
  "inline-flex h-9 cursor-pointer items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-transparent bg-oa-secondary px-3 text-sm font-medium text-oa-secondary-fg outline-none transition-all hover:bg-[color-mix(in_srgb,var(--oa-secondary)_95%,var(--ink))] focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)] active:translate-y-px active:scale-[0.98]";

const SECONDARY_LINK =
  "inline-flex h-9 cursor-pointer items-center justify-center gap-1 whitespace-nowrap rounded-lg px-3 text-sm font-medium text-oa-muted-fg outline-none transition-colors hover:text-oa-fg focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]";

export function ProWelcomePanel({ variant = "page", onDismiss }: Props) {
  const isModal = variant === "modal";

  if (isModal) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <span className="w-fit rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
            Pro active
          </span>
          <h2 className="text-balance font-medium tracking-tight text-oa-fg text-xl leading-tight sm:text-2xl">
            You&apos;re on Pro.
          </h2>
          <p className="max-w-md text-sm leading-6 text-oa-muted-fg">
            Your detailed calls, Stocksbrew targets, unlimited Watchlist and alerts are active.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {PRO_VALUE_PILLARS.map((item) => (
            <div
              key={item.id}
              className="flex flex-col gap-2 rounded-[18px] border border-oa-border bg-oa-bg px-3.5 py-3"
            >
              <span aria-hidden="true" className="size-1.5 rounded-full bg-oa-primary" />
              <span className="text-sm font-medium leading-snug text-oa-fg">{item.shortTitle}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {onDismiss ? (
            <button type="button" onClick={onDismiss} className={SECONDARY_LINK}>
              Close
            </button>
          ) : null}
          <Link href="/watchlist" className={PRIMARY_LINK}>
            Build my Watchlist
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[560px] flex-col items-center gap-5 text-center">
      <span className="w-fit rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
        Pro active
      </span>
      <div className="flex flex-col gap-2">
        <h2 className="text-balance font-medium tracking-tight text-oa-fg text-[2rem] leading-[1.08] sm:text-4xl sm:leading-[1.06]">
          You&apos;re in.
        </h2>
        <p className="text-pretty text-base leading-7 text-oa-muted-fg">
          Start with one stock. Then read its call and target, and choose the alerts that should
          bring you back.
        </p>
      </div>

      <div className="grid w-full grid-cols-1 gap-2 text-left">
        {PRO_WELCOME_STEPS.map((step, index) => (
          <Link
            key={step.title}
            href={step.href}
            className="flex items-start gap-3 rounded-[18px] border border-oa-border bg-oa-bg px-4 py-3 no-underline outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent"
          >
            <span className="oa-mono shrink-0 pt-0.5 text-xs text-oa-muted-fg">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span>
              <span className="block text-sm font-medium text-oa-fg">{step.title}</span>
              <span className="mt-0.5 block text-sm leading-6 text-oa-muted-fg">{step.body}</span>
            </span>
          </Link>
        ))}
      </div>

      <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
        <Link href="/watchlist" className={PRIMARY_LINK}>
          Build my Watchlist
        </Link>
        <Link href="/" className={SECONDARY_LINK}>
          Browse stocks
        </Link>
      </div>
    </div>
  );
}
