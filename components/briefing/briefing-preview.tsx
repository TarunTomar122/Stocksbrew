import { StockLogo } from "@/components/stock-logo";
import { briefingSections, type Briefing, type BriefingItem } from "@/lib/briefing";
import { loadBriefingPreview } from "@/lib/briefing-data";
import { groupBriefingSections } from "@/lib/briefing-groups";

import { KIND_LABEL, longDay, sourceTime } from "./format";
import { ItemMetric } from "./item-metric";
import { AppLink } from "@/components/oa/app-link";

/**
 * A compact card of the top three briefing items.
 *
 * With no props it builds the briefing for whoever is asking: their own when
 * they are signed in and track something, the market view otherwise. Pass
 * `briefing` to render a specific one (the landing page can pass the market
 * view it already loaded). Everything shown comes from the briefing itself.
 */
export async function BriefingPreview({
  briefing: given,
  href = "/briefing",
  className = "",
}: {
  briefing?: Briefing;
  href?: string;
  className?: string;
}) {
  let briefing = given ?? null;
  if (!briefing) {
    briefing = await loadBriefingPreview()
      .then((data) => data.briefing)
      .catch(() => null);
  }

  const shell = `oa-surface flex min-w-0 flex-col overflow-hidden border border-oa-border bg-oa-card text-oa-fg ${className}`;
  if (!briefing) {
    return (
      <div className={shell}>
        <p className="px-4 py-6 text-[14px] leading-6 text-oa-muted-fg">
          Today&apos;s briefing is not available right now.
        </p>
      </div>
    );
  }

  const sections = briefingSections(briefing, null);
  // One row per stock: the most urgent update from each of the first three groups.
  const grouped = groupBriefingSections(sections);
  const items: BriefingItem[] = [...grouped.needs_you, ...grouped.worth_knowing, ...grouped.coming_up]
    .slice(0, 3)
    .map((group) => group.lines[0]?.item ?? group.items[0])
    .filter((item): item is BriefingItem => Boolean(item));
  const personal = briefing.mode === "personal";

  return (
    <div className={shell} data-briefing-preview={briefing.mode}>
      <div className="flex min-h-11 items-center justify-between gap-3 px-4 py-2">
        <p className="oa-caption">
          {personal ? "Your briefing" : "Market briefing"} · {longDay(briefing.date)}
        </p>
        <span className="oa-mono text-[11px] text-oa-muted-fg">
          {personal ? `${sections.attention} need you` : `${sections.attention} explained`}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="border-t border-oa-border px-4 py-4 text-[14px] leading-6 text-[color:color-mix(in_srgb,var(--oa-fg)_80%,transparent)]">{briefing.summary}</p>
      ) : (
        <ul className="border-t border-oa-border">
          {items.map((item) => (
            <li key={item.id} className="border-b border-oa-border last:border-b-0">
              <AppLink
                href={item.href}
                className="flex items-start gap-3 px-4 py-3 outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent"
              >
                {item.ticker ? (
                  <StockLogo ticker={item.ticker} size={28} className="mt-0.5 shrink-0 rounded-md" />
                ) : (
                  <span className="oa-mono mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-oa-bg text-[11px] text-oa-muted-fg">
                    JOB
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-3">
                    <span className="oa-caption">{KIND_LABEL[item.kind]}</span>
                    <ItemMetric item={item} className="text-[13px]" />
                  </span>
                  <span className="mt-0.5 block text-pretty text-[15px] font-medium leading-snug text-oa-fg">
                    {item.headline}
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-[13px] leading-5 text-oa-muted-fg">{item.why}</span>
                  <span className="mt-1 block text-[13px] leading-5 text-[color:color-mix(in_srgb,var(--oa-fg)_85%,transparent)]">
                    <span className="oa-caption">Next</span> {item.next_step}
                  </span>
                </span>
              </AppLink>
            </li>
          ))}
        </ul>
      )}
      <AppLink
        href={href}
        className="flex items-center justify-between gap-3 border-t border-oa-border px-4 py-2.5 text-[13px] font-medium text-oa-fg outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent"
      >
        <span>{personal ? "Open your briefing" : "Read the full briefing"} →</span>
        <span className="oa-mono text-[11px] font-normal text-oa-muted-fg">Built {sourceTime(briefing.built_at)}</span>
      </AppLink>
    </div>
  );
}
