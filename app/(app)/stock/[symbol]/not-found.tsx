import { AppPage, PageHead, Panel } from "@/components/oa/kit";
import { StockRequestCard } from "@/components/seo/stock-request-card";

const PLACES: Array<{ href: string; label: string; what: string }> = [
  { href: "/screener", label: "Screener", what: "Every US stock we cover, filterable" },
  { href: "/sectors", label: "Sectors", what: "Stocks by sector, with today's leaders and laggards" },
  { href: "/briefing", label: "Briefing", what: "What moved today and why" },
];

/**
 * The 404 for /stock/<T> when we hold no stock at that ticker. It keeps the
 * request flow the old "not in our library yet" page offered, one click away.
 */
export default function StockNotFound() {
  return (
    <AppPage width="read">
      <PageHead full crumb={<a href="/screener">Stocks</a>} title="No stock page at this address" />
      <StockRequestCard />
      <Panel flush>
        <ul>
          {PLACES.map((place) => (
            <li key={place.href} className="border-b border-oa-border last:border-b-0">
              <a href={place.href} className="group flex items-center justify-between gap-4 px-4 py-3 outline-none hover:bg-oa-accent focus-visible:bg-oa-accent">
                <span className="min-w-0">
                  <span className="block text-[15px] font-medium leading-[22px] text-oa-fg">{place.label}</span>
                  <span className="mt-0.5 block text-pretty text-[14px] leading-[20px] text-oa-muted-fg">{place.what}</span>
                </span>
                <span aria-hidden="true" className="shrink-0 text-[15px] text-oa-muted-fg group-hover:text-oa-primary">→</span>
              </a>
            </li>
          ))}
        </ul>
      </Panel>
    </AppPage>
  );
}
