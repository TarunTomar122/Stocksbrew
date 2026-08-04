import Link from "next/link";

import { listMarketDailyEditions } from "@/lib/market-daily";

function shortDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  }).format(new Date(`${value}T12:00:00-04:00`));
}

export async function HomeMarketDaily() {
  const editions = await listMarketDailyEditions(3).catch(() => []);
  if (!editions.length) return null;

  return (
    <section className="border-t border-outline-variant bg-background" aria-labelledby="home-market-daily-title">
      <div className="landing-inner py-16 lg:py-20">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Market Daily</p>
            <h2 id="home-market-daily-title" className="mt-2 max-w-2xl text-2xl font-bold tracking-tight text-on-surface sm:text-3xl">
              What moved, and why it mattered.
            </h2>
          </div>
          <Link href="/market-daily" className="text-[13px] font-bold text-primary hover:underline">
            Read every Market Daily →
          </Link>
        </div>

        <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-outline-variant bg-outline-variant lg:grid-cols-3">
          {editions.map((edition, index) => (
            <article key={edition.edition_date} className="flex min-h-[18rem] flex-col bg-surface p-6 sm:p-7">
              <div className="flex items-center justify-between gap-3">
                <time dateTime={edition.edition_date} className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-on-surface-variant">
                  {shortDate(edition.edition_date)}
                </time>
                {index === 0 ? <span className="rounded-full bg-on-surface px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.11em] text-surface">Latest</span> : null}
              </div>
              <h3 className="mt-6 text-[22px] font-bold leading-[1.15] tracking-[-0.025em] text-on-surface">
                <Link href={`/market-daily/${edition.edition_date}`} className="hover:text-primary">
                  {edition.headline}
                </Link>
              </h3>
              <p className="mt-4 line-clamp-4 text-[14px] leading-6 text-on-surface-variant">{edition.dek}</p>
              <Link href={`/market-daily/${edition.edition_date}`} className="mt-auto pt-7 text-[12px] font-bold uppercase tracking-[0.08em] text-on-surface hover:text-primary">
                Read the market view →
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function HomeMarketDailySkeleton() {
  return (
    <section className="border-t border-outline-variant bg-background" aria-hidden>
      <div className="landing-inner py-16 lg:py-20">
        <div className="h-8 w-72 animate-pulse rounded bg-surface-container" />
        <div className="mt-8 grid gap-3 lg:grid-cols-3">
          {[0, 1, 2].map((item) => <div key={item} className="h-72 animate-pulse rounded-2xl bg-surface-container-low" />)}
        </div>
      </div>
    </section>
  );
}
