import Link from "next/link";

import { StockLogo } from "@/components/stock-logo";
import { SquircleSurface } from "@/components/oa/squircle";
import { INVESTMENT_THEMES } from "@/lib/investment-themes";

export function ThemeDirectory() {
  return (
    <section
      aria-labelledby="research-themes-heading"
      className="flex flex-col gap-5"
    >
      <div className="flex flex-col gap-2">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-[0.16em] text-oa-muted-fg">
            Research themes
          </p>
          <h2
            id="research-themes-heading"
            className="mt-2 text-[28px] font-medium leading-tight tracking-tight text-oa-fg sm:text-3xl"
          >
            Follow the story underneath the market.
          </h2>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {INVESTMENT_THEMES.map((theme) => (
          <Link
            key={theme.slug}
            href={`/themes/${theme.slug}`}
            className="group min-w-0 rounded-[26px] outline-none focus-visible:ring-2 focus-visible:ring-oa-fg/40 sm:rounded-[34px]"
          >
            <SquircleSurface className="flex h-full flex-col border border-oa-border p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-[border-color,box-shadow,transform] duration-200 group-hover:-translate-y-0.5 group-hover:border-oa-fg/25 group-hover:shadow-[0_8px_24px_rgba(0,0,0,0.07)] group-focus-visible:-translate-y-0.5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[19px] font-medium tracking-tight text-oa-fg">
                    {theme.name}
                  </h3>
                  <p className="mt-2 text-[14px] leading-5 text-oa-muted-fg">
                    {theme.cardDescription}
                  </p>
                </div>
                <span
                  aria-hidden
                  className="pt-0.5 text-xl leading-none text-oa-muted-fg transition-transform duration-200 group-hover:translate-x-0.5"
                >
                  →
                </span>
              </div>

              <div
                className="mt-auto flex shrink-0 items-center gap-1.5 pt-6"
                aria-label={`${theme.name} example stocks`}
              >
                {theme.candidates.slice(0, 4).map((candidate) => (
                  <StockLogo
                    key={candidate.ticker}
                    ticker={candidate.ticker}
                    size={30}
                    circle
                  />
                ))}
                <span className="ml-1 text-[12px] tabular-nums text-oa-muted-fg">
                  +{theme.candidates.length - 4}
                </span>
              </div>
            </SquircleSurface>
          </Link>
        ))}
      </div>
    </section>
  );
}
