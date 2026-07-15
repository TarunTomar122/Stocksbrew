import Link from "next/link";

import { SHORT_DESCRIPTION } from "@/lib/brand-copy";

type Column = {
  title: string;
  links: { label: string; href: string; external?: boolean }[];
};

const COLUMNS: Column[] = [
  {
    title: "Product",
    links: [
      { label: "Market Pulse", href: "/pulse" },
      { label: "Radar", href: "/radar" },
      { label: "Pre-market movers", href: "/premarket" },
      { label: "Earnings", href: "/earnings" },
    ],
  },
  {
    title: "Free tools",
    links: [
      { label: "All free tools", href: "/free-tools" },
      { label: "Should I Buy?", href: "/should-i-buy" },
      { label: "Compare stocks", href: "/compare-stocks" },
      { label: "Portfolio Analyzer", href: "/portfolio" },
      { label: "Position calculator", href: "/position-size-calculator" },
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
      { label: "Compare stocksbrew", href: "/compare" },
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
      { label: "Cookie policy", href: "/legal/cookies" },
      { label: "Disclaimer", href: "/legal/disclaimer" },
    ],
  },
];

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
            <div className="mt-2 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/85">
                <span className="relative inline-flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#10b981] opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#10b981]" />
                </span>
                Live now
              </span>
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

        <div className="my-8">
          <a
            href="https://www.scrolllaunch.com/products/stocksbrew?utm_source=badge&utm_medium=embed&utm_campaign=stocksbrew&ref=scrolllaunch"
            target="_blank"
            rel="noopener noreferrer"
          >
            <img
              src="https://www.scrolllaunch.com/api/badge/tikrr"
              alt="Featured on ScrollLaunch"
              width={220}
              height={48}
              loading="lazy"
            />
          </a>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-6">
          <p className="text-[12px] text-white/55">© {year} stocksbrew. All rights reserved.</p>
          <p className="max-w-[640px] text-[12px] text-white/45">
            stocksbrew provides market data and analytics for informational purposes only. Nothing here is investment
            advice. Past performance does not guarantee future results.
          </p>
        </div>
      </div>
    </footer>
  );
}
