import type { CSSProperties } from "react";
import Link from "next/link";

import {
  getFreeToolByHref,
  getRelatedFreeTools,
  type HubLink,
} from "@/lib/free-tools-hub-data";

export function FreeToolBreadcrumb({ title }: { title?: string }) {
  return (
    <nav aria-label="Breadcrumb" className="free-tool-breadcrumb">
      <Link href="/free-tools" className="free-tool-breadcrumb-link">
        Free tools
      </Link>
      {title ? (
        <>
          <span className="free-tool-breadcrumb-sep" aria-hidden>
            /
          </span>
          <span className="text-on-surface">{title}</span>
        </>
      ) : null}
    </nav>
  );
}

export function FreeToolHero({
  title,
  description,
  icon,
  accent,
  badge = "Free tool",
}: {
  title: string;
  description: string;
  icon: string;
  accent: string;
  badge?: string;
}) {
  return (
    <header className="free-tool-hero" style={{ "--tool-accent": accent } as CSSProperties}>
      <div className="free-tool-hero-copy">
        <FreeToolBreadcrumb title={title} />
        <span className="free-tool-hero-badge">{badge}</span>
        <h1 className="free-tool-hero-title">{title}</h1>
        <p className="free-tool-hero-desc">{description}</p>
        <div className="free-tool-hero-actions">
          <Link href="/free-tools" className="landing-btn-secondary px-4 py-2 text-sm">
            All tools
          </Link>
          <Link href="/watchlist" className="landing-btn-primary px-4 py-2 text-sm">
            Open Radar
          </Link>
        </div>
      </div>
      <div className="free-tool-hero-visual" aria-hidden>
        <div className="free-tool-hero-orbit" />
        <div className="free-tool-hero-icon-wrap">
          <span className="material-symbols-outlined text-[34px]" style={{ fontVariationSettings: "'wght' 300" }}>
            {icon}
          </span>
        </div>
        <div className="free-tool-hero-float free-tool-hero-float--a">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">Score</span>
          <span className="text-lg font-bold text-landing-brand">82</span>
        </div>
        <div className="free-tool-hero-float free-tool-hero-float--b">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">Heat</span>
          <span className="text-lg font-bold" style={{ color: accent }}>
            91
          </span>
        </div>
      </div>
    </header>
  );
}

function RelatedCard({ tool }: { tool: HubLink }) {
  return (
    <Link
      href={tool.href}
      className="free-tool-related-card"
      style={{ "--tool-accent": tool.accent } as CSSProperties}
    >
      <span className="free-tool-related-icon">
        <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'wght' 400" }}>
          {tool.icon}
        </span>
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold text-on-surface">{tool.title}</span>
        <span className="mt-0.5 block line-clamp-2 text-[12px] leading-snug text-on-surface-variant">
          {tool.description}
        </span>
      </span>
    </Link>
  );
}

export function FreeToolRelated({ currentHref }: { currentHref: string }) {
  const related = getRelatedFreeTools(currentHref, 3);
  if (related.length === 0) return null;

  return (
    <section className="free-tool-related">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-on-surface">More free tools</h2>
          <p className="mt-1 text-[13px] text-on-surface-variant">Keep exploring — everything here stays free.</p>
        </div>
        <Link href="/free-tools" className="text-[13px] font-semibold text-landing-brand hover:underline">
          View all →
        </Link>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {related.map((tool) => (
          <RelatedCard key={tool.href} tool={tool} />
        ))}
      </div>
    </section>
  );
}

export function FreeToolPageFrame({
  toolHref,
  children,
  hero = "full",
}: {
  toolHref: string;
  children: React.ReactNode;
  hero?: "full" | "compact";
}) {
  const tool = getFreeToolByHref(toolHref);

  return (
    <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-10 px-6 py-10 md:px-10 md:py-14 lg:px-16">
      {hero === "full" && tool ? (
        <FreeToolHero
          title={tool.title}
          description={tool.description}
          icon={tool.icon}
          accent={tool.accent}
        />
      ) : (
        <FreeToolBreadcrumb title={tool?.title} />
      )}
      {children}
      <FreeToolRelated currentHref={toolHref} />
    </div>
  );
}
