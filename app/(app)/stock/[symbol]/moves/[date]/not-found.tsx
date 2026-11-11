import { AppPage, PageHead, Panel } from "@/components/oa/kit";

const PLACES: Array<{ href: string; label: string; what: string }> = [
  { href: "/movers", label: "Movers", what: "Every day of big moves, each with what caused it" },
  { href: "/signals?tab=movers", label: "Today's movers", what: "Unusual moves in the current session" },
  { href: "/screener", label: "Screener", what: "Every US stock we cover" },
];

/** A move page exists only when we found and sourced the reason for that move. */
export default function MoveNotFound() {
  return (
    <AppPage width="read">
      <PageHead full crumb={<a href="/movers">Movers</a>} title="No explained move at this address" lede="We only publish a move when we found its reason and can cite a source." />
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
