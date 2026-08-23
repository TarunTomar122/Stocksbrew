import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import { StartFreeButton } from "@/components/oa/start-free-button";
import { interTight } from "@/components/oa/font";
import { SHORT_DESCRIPTION } from "@/lib/brand-copy";

const FRAME = "mx-auto w-full max-w-[76rem] px-4 sm:px-6";

const PILL_CTA =
  "inline-flex h-11 items-center justify-center whitespace-nowrap rounded-lg border border-[color-mix(in_srgb,var(--oa-primary)_80%,#3a3480)] bg-[color-mix(in_srgb,var(--oa-primary)_90%,#3a3480)] px-6 text-base font-medium text-oa-primary-fg shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-1px_0_rgba(58,52,128,0.30)] outline-none transition-all hover:bg-oa-primary active:translate-y-px active:scale-[0.98]";

type Column = {
  title: string;
  links: { label: string; href: string; external?: boolean }[];
};

const COLUMNS: Column[] = [
  {
    title: "Product",
    links: [
      { label: "Market today", href: "/pulse" },
      { label: "Explore", href: "/explore" },
      { label: "Watchlist", href: "/watchlist" },
      { label: "Earnings", href: "/earnings" },
      { label: "US stocks", href: "/stocks" },
      { label: "AI agent access", href: "/agents" },
    ],
  },
  {
    title: "Free tools",
    links: [
      { label: "Power Trades", href: "/power-trades" },
      { label: "Should I Buy?", href: "/should-i-buy" },
      { label: "Compare stocks", href: "/compare-stocks" },
      { label: "Portfolio Analyzer", href: "/portfolio" },
      { label: "Market Heat", href: "/heat" },
      { label: "Screens", href: "/screens" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Learn & guides", href: "/resources" },
      { label: "Blog", href: "/blog" },
      { label: "Use cases", href: "/use-cases" },
      { label: "Developer API", href: "/developers" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Pricing", href: "/subscribe" },
      { label: "Contact", href: "mailto:tomartarun2001@gmail.com", external: true },
      { label: "Terms of service", href: "/legal/terms" },
      { label: "Privacy policy", href: "/legal/privacy" },
    ],
  },
];

/**
 * The site-wide footer, in the OA design language.
 *
 * The footer is the last thing a visitor reads, so it sells before it
 * lists: one outcome headline, one action, one risk-reversal line. Then
 * navigation, then the legal line. The background stays transparent so the
 * footer sits seamlessly on whatever page hosts it; Pro subscribers skip
 * the sell strip entirely.
 */
export function Footer({ isSubscribed = false }: { isSubscribed?: boolean }) {
  const year = new Date().getFullYear();
  return (
    <footer className={`oa-app ${interTight.variable} text-oa-fg`}>
      <div className={`${FRAME} py-12 sm:py-16`}>
        {/* the sell: outcome, action, risk reversal */}
        {!isSubscribed && (
          <div className="flex flex-col gap-6 rounded-[26px] bg-[color-mix(in_srgb,var(--oa-fg)_4%,transparent)] p-7 sm:flex-row sm:items-center sm:justify-between sm:p-10">
            <div className="max-w-xl">
              <h2 className="text-balance font-medium tracking-tight text-oa-fg text-[26px] leading-tight sm:text-3xl">
                Know what&rsquo;s moving before the crowd does.
              </h2>
              <p className="mt-2 text-[16.5px] leading-7 text-oa-muted-fg">
                Eight live market scans and plain-English briefs, updated every few minutes.
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-start gap-2.5 sm:items-end">
              <StartFreeButton surface="footer" className={PILL_CTA} />
              <p className="text-sm leading-5 text-oa-muted-fg">Free forever for 3 stocks. No card required.</p>
            </div>
          </div>
        )}

        {/* brand + navigation */}
        <div className="mt-12 grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3 lg:grid-cols-6">
          <div className="col-span-2 flex flex-col gap-4">
            <Link href="/" className="w-fit text-[19px] font-medium tracking-tight text-oa-fg">
              stocksbrew<span aria-hidden className="text-oa-primary">.</span>
            </Link>
            <p className="max-w-[320px] text-[15px] leading-7 text-oa-muted-fg">{SHORT_DESCRIPTION}</p>
            <div className="mt-2 flex w-fit items-center gap-3">
              <span className="text-xs uppercase tracking-[0.12em] text-oa-muted-fg">Appearance</span>
              <ThemeToggle />
            </div>
          </div>

          {COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title} className="flex flex-col gap-4">
              <h3 className="text-[13px] font-medium uppercase tracking-[0.14em] text-oa-muted-fg">{col.title}</h3>
              <ul className="flex flex-col gap-3">
                {col.links.map((link) => (
                  <li key={link.label}>
                    {link.external ? (
                      <a href={link.href} className="text-[15px] leading-6 text-oa-muted-fg transition-colors hover:text-oa-fg">
                        {link.label}
                      </a>
                    ) : (
                      <Link href={link.href} className="text-[15px] leading-6 text-oa-muted-fg transition-colors hover:text-oa-fg">
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/* legal */}
        <div className="mt-12 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] text-oa-muted-fg">© {year} stocksbrew. All rights reserved.</p>
          <p className="max-w-[640px] text-[13px] leading-5 text-oa-muted-fg">
            Market data and analytics for informational purposes only. Nothing here is investment advice. Past
            performance does not guarantee future results.
          </p>
        </div>
      </div>
    </footer>
  );
}
