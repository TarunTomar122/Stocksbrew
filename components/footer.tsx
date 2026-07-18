import Link from "next/link";

import { SHORT_DESCRIPTION } from "@/lib/brand-copy";
import styles from "./footer.module.css";

type Column = {
  title: string;
  links: { label: string; href: string; external?: boolean }[];
};

const COLUMNS: Column[] = [
  {
    title: "Product",
    links: [
      { label: "Market Pulse", href: "/pulse" },
      { label: "Social", href: "/social" },
      { label: "Radar", href: "/radar" },
      { label: "Pre-market movers", href: "/premarket" },
      { label: "Earnings", href: "/earnings" },
      { label: "US stocks", href: "/stocks" },
      { label: "Stock sectors", href: "/sectors" },
      { label: "AI agent access", href: "/agents" },
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
      { label: "Stock analysis apps", href: "/blog/best-stock-analysis-apps-2026" },
      { label: "Fundamental analysis", href: "/blog/fundamental-stock-analysis-framework" },
      { label: "Earnings template", href: "/blog/earnings-report-analysis-template" },
      { label: "Use cases", href: "/use-cases" },
      { label: "Compare stocksbrew", href: "/compare" },
      { label: "Developer API", href: "/developers" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Editorial policy", href: "/editorial-policy" },
      { label: "Author", href: "/authors/tarun-tomar" },
      { label: "Pricing", href: "/subscribe" },
      { label: "Contact", href: "mailto:tomartarun2001@gmail.com", external: true },
      { label: "Terms of service", href: "/legal/terms" },
      { label: "Privacy policy", href: "/legal/privacy" },
      { label: "Cookie policy", href: "/legal/cookies" },
      { label: "Disclaimer", href: "/legal/disclaimer" },
    ],
  },
];

const BADGES = [
  {
    href: "https://www.scrolllaunch.com/products/stocksbrew?utm_source=badge&utm_medium=embed&utm_campaign=stocksbrew&ref=scrolllaunch",
    src: "https://www.scrolllaunch.com/api/badge/tikrr",
    alt: "Featured on ScrollLaunch",
    width: 220,
    height: 48,
  },
  {
    href: "https://daniellaunches.com",
    src: "https://daniellaunches.com/badge-light.svg",
    alt: "Featured on DanielLaunches",
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
    href: "https://www.toolpilot.ai",
    src: "https://www.toolpilot.ai/cdn/shop/files/f-w_690x151_crop_center.png",
    alt: "Featured on ToolPilot.ai",
    width: 164,
    height: 36,
  },
  {
    href: "https://wired.business",
    src: "https://wired.business/badge0-white.svg",
    alt: "Featured on Wired Business",
    width: 200,
    height: 54,
  },
  {
    href: "https://twelve.tools",
    src: "https://twelve.tools/badge0-white.svg",
    alt: "Featured on Twelve Tools",
    width: 200,
    height: 54,
  },
  {
    href: "https://auraplusplus.com",
    src: "https://auraplusplus.com/images/badges/featured-on-light.svg",
    alt: "Featured on Aura++",
    width: 150,
    height: 44,
  },
  {
    href: "https://www.aitoolzdir.com",
    label: "AI Toolz Dir",
    alt: "Listed on AI Toolz Dir",
  },
  {
    href: "https://dofollow.tools",
    src: "https://dofollow.tools/badge/badge_light.svg",
    alt: "Featured on Dofollow.Tools",
    width: 180,
    height: 44,
  },
  {
    href: "https://hicyou.com",
    src: "https://hicyou.com/badge/featured-light.svg",
    alt: "Featured on Hi Cyou",
    width: 180,
    height: 44,
  },
  {
    href: "https://www.directree.io",
    src: "https://www.directree.io/badge/directree-badge-lightmode.svg",
    alt: "Verified on directree",
    width: 200,
    height: 37,
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

        <div className={`${styles.viewport} my-8 py-2`} aria-label="StocksBrew directory features">
          <div className={styles.track}>
            {[false, true].map((duplicate) => (
              <div className={styles.group} key={duplicate ? "duplicate" : "primary"} aria-hidden={duplicate}>
                {BADGES.map((badge) => (
                  <a
                    href={badge.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    tabIndex={duplicate ? -1 : undefined}
                    className="shrink-0 opacity-85 transition-opacity hover:opacity-100"
                    key={`${duplicate ? "duplicate" : "primary"}-${badge.alt}`}
                  >
                    {"src" in badge ? (
                      <img
                        src={badge.src}
                        alt={duplicate ? "" : badge.alt}
                        width={badge.width}
                        height={badge.height}
                        className="h-11 w-auto max-w-none object-contain"
                        loading="lazy"
                      />
                    ) : (
                      <span className={styles.textBadge} aria-label={duplicate ? undefined : badge.alt}>
                        <span className={styles.textBadgeEyebrow}>Listed on</span>
                        {badge.label}
                      </span>
                    )}
                  </a>
                ))}
              </div>
            ))}
          </div>
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
