import type { CSSProperties } from "react";
import { AnimatedIcon } from "@/components/animated-icon";
import Link from "next/link";

import { FaqSection } from "@/components/marketing/faq-section";
import {
  ALL_FREE_TOOLS,
  FEATURED_FREE_TOOLS,
  FREE_TOOL_GROUPS,
  FREE_TOOLS_FAQS,
  type HubLink,
} from "@/lib/free-tools-hub-data";

function FeaturedToolCard({ tool }: { tool: HubLink }) {
  return (
    <Link
      href={tool.href}
      className="free-tools-featured-card group"
      style={{ "--tool-accent": tool.accent } as CSSProperties}
    >
      <div className="free-tools-featured-glow" aria-hidden />
      <span className="free-tools-card-icon free-tools-card-icon--lg">
        <AnimatedIcon name={tool.icon} size={22} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="free-tools-featured-label">Popular</span>
        <h3 className="mt-1 text-[17px] font-bold tracking-tight text-on-surface group-hover:text-landing-brand transition-colors">
          {tool.title}
        </h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-on-surface-variant">{tool.description}</p>
        <span className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-landing-brand">
          Open tool
          <AnimatedIcon name="arrow_forward" size={16} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
        </span>
      </span>
    </Link>
  );
}

function ToolCard({ tool }: { tool: HubLink }) {
  return (
    <Link
      href={tool.href}
      className="free-tools-card group"
      style={{ "--tool-accent": tool.accent } as CSSProperties}
    >
      <span className="free-tools-card-icon">
        <AnimatedIcon name={tool.icon} size={20} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <h3 className="text-[15px] font-semibold text-on-surface group-hover:text-landing-brand transition-colors">
          {tool.title}
        </h3>
        <p className="mt-1 text-[13px] leading-relaxed text-on-surface-variant">{tool.description}</p>
      </span>
      <AnimatedIcon
        name="arrow_forward"
        size={18}
        className="shrink-0 text-on-surface-variant/50 transition-all group-hover:translate-x-0.5 group-hover:text-landing-brand"
        aria-hidden
      />
    </Link>
  );
}

export function FreeToolsHub() {
  return (
    <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-14 px-6 py-12 md:px-10 md:py-16 lg:px-16">
      <header className="free-tools-hub-hero">
        <div className="free-tools-hub-hero-copy">
          <span className="landing-section-kicker text-landing-brand">Free tools</span>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-on-surface sm:text-4xl md:text-[2.75rem] md:leading-tight">
            Every free research tool, one place.
          </h1>
          <p className="mt-4 max-w-[540px] text-[16px] leading-relaxed text-on-surface-variant">
            Check a ticker, scan the market, or size a trade. Add your favorites to Watchlist when you are
            ready to track them daily.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link href="/pulse" className="landing-btn-secondary px-4 py-2 text-sm">
              Market Pulse
            </Link>
            <Link href="/watchlist" className="landing-btn-primary px-4 py-2 text-sm">
              Open Watchlist
            </Link>
          </div>
          <div className="mt-8 flex flex-wrap gap-4 text-[12px] text-on-surface-variant">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-landing-brand" />
              No credit card
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-landing-brand" />
              US tickers
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-landing-brand" />
              Updated daily
            </span>
          </div>
        </div>

        <div className="free-tools-hub-visual" aria-hidden>
          <div className="free-tools-mock free-tools-mock--score">
            <span className="free-tools-mock-kicker">Should I Buy?</span>
            <div className="mt-3 flex items-end justify-between gap-3">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">NVDA</span>
                <span className="mt-1 block text-3xl font-bold text-landing-brand">82</span>
              </div>
              <div className="free-tools-mock-ring" />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {["Growth", "Quality", "Value"].map((label, i) => (
                <div key={label} className="rounded-lg bg-surface-container-high/80 px-2 py-1.5">
                  <span className="block text-[9px] font-medium text-on-surface-variant">{label}</span>
                  <span className="text-[13px] font-bold text-on-surface">{[88, 76, 71][i]}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="free-tools-mock free-tools-mock--heat">
            <span className="free-tools-mock-kicker">Market Heat</span>
            <ul className="mt-3 space-y-2">
              {[
                { t: "SMCI", s: 94 },
                { t: "ARM", s: 88 },
                { t: "PLTR", s: 81 },
              ].map((row) => (
                <li key={row.t} className="flex items-center justify-between gap-2 text-[12px]">
                  <span className="font-semibold text-on-surface">{row.t}</span>
                  <span className="rounded-full bg-orange-500/10 px-2 py-0.5 font-bold text-orange-600">{row.s}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="free-tools-mock free-tools-mock--compare">
            <span className="free-tools-mock-kicker">Compare</span>
            <div className="mt-3 grid grid-cols-3 gap-1 text-center text-[10px] font-semibold text-on-surface-variant">
              <span />
              <span>AAPL</span>
              <span className="text-landing-brand">MSFT</span>
            </div>
            {["P/E", "Score", "1Y"].map((row) => (
              <div key={row} className="mt-1.5 grid grid-cols-3 gap-1 text-center text-[11px]">
                <span className="text-left text-on-surface-variant">{row}</span>
                <span className="text-on-surface">28.4</span>
                <span className="rounded-md bg-landing-brand/10 font-bold text-landing-brand">32.1</span>
              </div>
            ))}
          </div>
        </div>
      </header>

      <section>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-on-surface">Start here</h2>
            <p className="mt-1 text-[14px] text-on-surface-variant">The tools people open most often.</p>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {FEATURED_FREE_TOOLS.map((tool) => (
            <FeaturedToolCard key={tool.href} tool={tool} />
          ))}
        </div>
      </section>

      {FREE_TOOL_GROUPS.map((group) => (
        <section key={group.title}>
          <div className="mb-5 max-w-2xl">
            <h2 className="text-xl font-bold text-on-surface">{group.title}</h2>
            <p className="mt-1 text-[14px] text-on-surface-variant">{group.description}</p>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {group.tools.map((tool) => (
              <ToolCard key={tool.href} tool={tool} />
            ))}
          </div>
        </section>
      ))}

      <section>
        <h2 className="text-xl font-bold text-on-surface">Free research guides</h2>
        <p className="mt-1 text-[14px] text-on-surface-variant">Choose the tools, then use them with a repeatable process.</p>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {[
            ["Build a $0 stock research stack", "/blog/free-stock-market-analysis-tools"],
            ["Compare stock watchlist apps", "/blog/best-stock-watchlist-apps-2026"],
            ["Read analyst targets correctly", "/blog/analyst-ratings-price-targets-explained"],
          ].map(([label, href]) => (
            <Link key={href} href={href} className="free-tools-card text-[15px] font-semibold text-on-surface hover:text-landing-brand">
              {label}
            </Link>
          ))}
        </div>
      </section>

      <section className="free-tools-quick-links">
        <h2 className="text-lg font-bold text-on-surface">All {ALL_FREE_TOOLS.length} tools</h2>
        <ul className="mt-4 flex flex-wrap gap-2">
          {ALL_FREE_TOOLS.map((t) => (
            <li key={t.href}>
              <Link href={t.href} className="free-tools-pill">
                {t.title}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="free-tools-radar-cta">
        <div className="free-tools-radar-cta-inner">
          <div>
            <h2 className="text-xl font-bold text-on-surface">Found a stock? Add it to Watchlist.</h2>
            <p className="mt-2 max-w-md text-[14px] leading-relaxed text-on-surface-variant">
              Free for up to three US tickers — daily briefs, alerts, and earnings intel when you are ready to go deeper.
            </p>
          </div>
          <Link href="/watchlist" className="landing-btn-primary shrink-0 px-5 py-2.5 text-sm">
            Open Watchlist
          </Link>
        </div>
      </section>

      <FaqSection title="Free tools FAQ" faqs={FREE_TOOLS_FAQS} />
    </div>
  );
}
