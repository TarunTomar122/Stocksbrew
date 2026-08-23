import Link from "next/link";

import { getFreeToolByHref, getRelatedFreeTools, type HubLink } from "@/lib/free-tools-hub-data";

const EYEBROW = "text-xs uppercase tracking-[0.12em] text-oa-muted-fg";
const H1 =
  "text-balance font-medium tracking-tight text-oa-fg text-[2.5rem] leading-[1.06] sm:text-5xl sm:leading-[1.04]";

const PILL =
  "inline-flex h-8 items-center rounded-full border border-oa-border bg-oa-card px-3.5 text-[13px] font-medium text-oa-muted-fg transition-colors hover:border-oa-fg/30 hover:text-oa-fg";

export function FreeToolBreadcrumb({ title }: { title?: string }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-2">
      <Link href="/free-tools" className="text-[13px] font-medium text-oa-muted-fg transition-colors hover:text-oa-fg">
        Free tools
      </Link>
      {title ? (
        <>
          <span className="text-oa-muted-fg" aria-hidden>
            ›
          </span>
          <span className="text-[13px] font-medium text-oa-fg">{title}</span>
        </>
      ) : null}
    </nav>
  );
}

export function FreeToolHero({
  title,
  description,
}: {
  title: string;
  description: string;
  icon?: string;
  accent?: string;
  badge?: string;
}) {
  return (
    <header className="flex max-w-[640px] flex-col gap-4">
      <FreeToolBreadcrumb title={title} />
      <h1 className={`mt-2 ${H1}`}>{title}</h1>
      <p className="text-[15px] leading-relaxed text-oa-muted-fg sm:text-base">{description}</p>
      <div className="mt-2 flex flex-wrap gap-3">
        <Link
          href="/free-tools"
          className="inline-flex h-10 items-center rounded-full border border-oa-border bg-oa-card px-4 text-sm font-medium text-oa-fg transition-colors hover:border-oa-fg/30"
        >
          All tools
        </Link>
        <Link
          href="/watchlist"
          className="inline-flex h-10 items-center rounded-full bg-oa-primary px-4 text-sm font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] transition-all hover:bg-[color-mix(in_srgb,var(--oa-primary)_88%,black)] active:translate-y-px active:scale-[0.98]"
        >
          Open Watchlist
        </Link>
      </div>
    </header>
  );
}

function RelatedCard({ tool }: { tool: HubLink }) {
  return (
    <Link
      href={tool.href}
      className="group flex flex-col gap-1.5 rounded-[18px] border border-oa-border bg-oa-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_2px_10px_rgba(0,0,0,0.08)]"
    >
      <span className="block text-sm font-medium tracking-tight text-oa-fg transition-colors group-hover:text-oa-primary">
        {tool.title}
      </span>
      <span className="block text-[13px] leading-relaxed text-oa-muted-fg">
        {tool.description}
      </span>
    </Link>
  );
}

export function FreeToolRelated({ currentHref }: { currentHref: string }) {
  const related = getRelatedFreeTools(currentHref, 3);
  if (related.length === 0) return null;

  return (
    <section aria-labelledby="related-tools">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="related-tools" className="text-[17px] font-medium tracking-tight text-oa-fg">More free tools</h2>
          <p className="mt-1 text-sm text-oa-muted-fg">Keep exploring. Everything here stays free.</p>
        </div>
        <Link href="/free-tools" className="text-[13px] font-medium text-oa-primary underline-offset-4 hover:underline">
          View all ›
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
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
    <div className="mx-auto flex w-full max-w-[76rem] flex-col gap-10 px-4 py-10 sm:px-6 sm:py-14">
      {hero === "full" && tool ? (
        <FreeToolHero title={tool.title} description={tool.description} />
      ) : (
        <FreeToolBreadcrumb title={tool?.title} />
      )}
      {children}
      <FreeToolRelated currentHref={toolHref} />
    </div>
  );
}
