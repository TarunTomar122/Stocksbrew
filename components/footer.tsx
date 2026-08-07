import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import { SHORT_DESCRIPTION } from "@/lib/brand-copy";

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

const BADGES = [
  {
    href: "https://submitforbacklinks.com/badge/xNvGEzXTw4VcoyOPskL10pWc?ref=badge",
    src: "https://submitforbacklinks.com/api/badge/xNvGEzXTw4VcoyOPskL10pWc.svg?variant=verified&theme=dark",
    alt: "stocksbrew — Verified on SubmitForBacklinks",
    width: 220,
    height: 48,
  },
  {
    href: "https://www.scrolllaunch.com/products/stocksbrew?utm_source=badge&utm_medium=embed&utm_campaign=stocksbrew&ref=scrolllaunch",
    src: "https://www.scrolllaunch.com/api/badge/tikrr",
    alt: "Featured on ScrollLaunch",
    width: 220,
    height: 48,
  },
  {
    href: "https://fazier.com",
    src: "https://fazier.com/api/v1//public/badges/launch_badges.svg?badge_type=launched&theme=light",
    alt: "Launched on Fazier",
    width: 120,
    height: 48,
  },
  {
    href: "https://startupfa.me/s/stocksbrew?utm_source=www.stocksbrew.online",
    src: "https://startupfa.me/badges/featured-badge-small.webp",
    alt: "StocksBrew - Featured on Startup Fame",
    width: 224,
    height: 36,
  },
  {
    href: "https://wired.business",
    src: "https://wired.business/badge0-white.svg",
    alt: "Featured on Wired Business",
    width: 200,
    height: 54,
  },
] as const;

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-16 bg-[#070b09] text-white">
      <div className="mx-auto w-full max-w-screen-2xl px-6 py-16 md:px-10 lg:px-16">
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:grid-cols-6">
          <div className="col-span-2 flex flex-col gap-4">
            <Link href="/" className="flex w-fit items-center gap-1.5">
              <span className="font-mono text-[19px] font-bold leading-none tracking-[-0.03em] text-white">
                stocksbrew<span style={{ color: "#4ade80" }}>.</span>
              </span>
            </Link>
            <p className="max-w-[320px] text-[14px] leading-[1.55] text-white/65">{SHORT_DESCRIPTION}</p>
            <div className="mt-2 flex w-fit items-center gap-2.5">
              <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-white/50">
                Appearance
              </span>
              <ThemeToggle variant="footer" />
            </div>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title} className="flex flex-col gap-3">
              <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-white/55">
                {col.title}
              </h3>
              <ul className="flex flex-col gap-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    {link.external ? (
                      <a
                        href={link.href}
                        className="text-[14px] text-white/80 transition-colors hover:text-white"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-[14px] text-white/80 transition-colors hover:text-white"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-6">
          <p className="text-[12px] text-white/55">© {year} stocksbrew. All rights reserved.</p>
          <p className="max-w-[640px] text-[12px] text-white/45">
            stocksbrew provides market data and analytics for informational purposes only. Nothing here is investment
            advice. Past performance does not guarantee future results.
          </p>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3" aria-label="StocksBrew directory features">
          {BADGES.map((badge) => (
            <a
              href={badge.href}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 opacity-85 transition-opacity hover:opacity-100"
              key={badge.alt}
            >
              <img
                src={badge.src}
                alt={badge.alt}
                width={badge.width}
                height={badge.height}
                className="h-6 w-auto max-w-none object-contain"
                loading="lazy"
              />
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
