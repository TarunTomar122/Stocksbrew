import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import { StartFreeButton } from "@/components/oa/start-free-button";
import { interTight } from "@/components/oa/font";
import { SHORT_DESCRIPTION } from "@/lib/brand-copy";
import { StocksbrewLogo } from "@/components/stocksbrew-logo";

const FRAME = "mx-auto w-full max-w-[84rem] px-4 sm:px-6 lg:px-8";

const PILL_CTA =
  "inline-flex h-10 items-center justify-center whitespace-nowrap rounded-lg border border-[color-mix(in_srgb,var(--oa-primary)_80%,#3a1a05)] bg-oa-primary px-5 text-[15px] font-medium text-oa-primary-fg shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] outline-none transition-all hover:brightness-110 active:translate-y-px active:scale-[0.98]";

type Column = {
  title: string;
  links: { label: string; href: string; external?: boolean }[];
};

/** The product map, as links, by the same names as the sidebar. Keep in step with components/oa/nav-items.ts. */
const COLUMNS: Column[] = [
  {
    title: "Today",
    links: [
      { label: "Briefing", href: "/briefing" },
      { label: "Market today", href: "/explore" },
      { label: "Why stocks moved", href: "/movers" },
      { label: "Signals", href: "/signals" },
      { label: "News", href: "/news" },
      { label: "Calendar", href: "/calendar" },
    ],
  },
  {
    title: "Research",
    links: [
      { label: "Find stocks", href: "/screener" },
      { label: "Sectors", href: "/sectors" },
      { label: "Compare", href: "/compare" },
      { label: "Markets", href: "/markets" },
      { label: "Filings", href: "/filings" },
      { label: "Ask", href: "/ask" },
      { label: "Themes", href: "/themes" },
      { label: "Strategies", href: "/strategies" },
      { label: "Backtest", href: "/backtest" },
    ],
  },
  {
    title: "Yours",
    links: [
      { label: "My stocks", href: "/watchlist" },
      { label: "Practice account", href: "/practice" },
      { label: "Follow investors", href: "/follow" },
      { label: "Insiders", href: "/insiders" },
      { label: "Alerts & agents", href: "/agents" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Pricing", href: "/pricing" },
      { label: "Docs", href: "/docs" },
      { label: "Developers", href: "/developers" },
      { label: "Security", href: "/security" },
      { label: "About", href: "/about" },
      { label: "Blog", href: "/blog" },
      { label: "Contact", href: "mailto:tomartarun2001@gmail.com", external: true },
    ],
  },
];

/**
 * The site-wide footer. On the landing it closes with one more invitation;
 * inside the app (where the sidebar is) that strip is hidden in CSS and the
 * footer is just the map and the small print. The body already reserves
 * the phone tab bar's height (globals.css), so no extra padding here.
 */
export function Footer({ isSubscribed = false }: { isSubscribed?: boolean }) {
  const year = new Date().getFullYear();
  return (
    <footer className={`oa-app ${interTight.variable} border-t border-oa-border text-oa-fg`}>
      <div className={`${FRAME} pb-10 pt-10`}>
        {!isSubscribed && (
          <div className="oa-footer-sell oa-surface mb-10 flex flex-col gap-5 border border-oa-border bg-oa-card p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div className="max-w-xl">
              <h2 className="text-balance text-[24px] font-medium leading-tight tracking-tight text-oa-fg sm:text-[28px]">
                Let the agent do the reading.
              </h2>
              <p className="mt-1.5 text-[15.5px] leading-6 text-oa-muted-fg">
                Follow five stocks free. You hear from us when something changes.
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
              <StartFreeButton surface="footer" className={PILL_CTA} />
              <p className="text-[13px] leading-5 text-oa-muted-fg">No card. No broker login.</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-6">
          <div className="col-span-2 flex flex-col gap-3">
            <Link href="/" className="w-fit text-oa-fg">
              <StocksbrewLogo markSize={22} wordmarkClassName="text-[17px] font-medium tracking-tight" />
            </Link>
            <p className="max-w-[300px] text-[14px] leading-6 text-oa-muted-fg">{SHORT_DESCRIPTION}</p>
            <div className="mt-1 flex w-fit items-center gap-3">
              <span className="oa-caption">Appearance</span>
              <ThemeToggle />
            </div>
          </div>

          {COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title} className="flex flex-col gap-2.5">
              <h3 className="oa-caption">{col.title}</h3>
              <ul className="flex flex-col gap-1.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    {link.external ? (
                      <a href={link.href} className="text-[14px] leading-6 text-oa-muted-fg transition-colors hover:text-oa-fg">
                        {link.label}
                      </a>
                    ) : (
                      <Link href={link.href} className="text-[14px] leading-6 text-oa-muted-fg transition-colors hover:text-oa-fg">
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-oa-border pt-5 sm:flex-row sm:items-start sm:justify-between">
          <p className="oa-mono text-[11.5px] leading-5 text-oa-muted-fg">
            © {year} stocksbrew ·{" "}
            <Link href="/legal/terms" className="hover:text-oa-fg">
              Terms
            </Link>{" "}
            ·{" "}
            <Link href="/legal/privacy" className="hover:text-oa-fg">
              Privacy
            </Link>
          </p>
          <p className="max-w-[640px] text-[12.5px] leading-5 text-oa-muted-fg">
            Research and data for information only, not investment advice. stocksbrew does not connect to a brokerage
            and cannot place trades. Past performance, backtested or real, does not guarantee future results.
          </p>
        </div>
      </div>
    </footer>
  );
}
