import { EmptyState } from "@/components/empty-state";
import { BlindSpotCard } from "@/components/cards";
import { Shell } from "@/components/shell";
import { getDashboardPayload } from "@/lib/api";
import { LOCAL_USER } from "@/lib/local-user";
import type { PortfolioBriefData } from "@/lib/api-types";

export const revalidate = 60;

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readString(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

/* ── Top brief banner ── */
function NarrativeBanner({ narrative }: { narrative: string }) {
  return (
    <div className="rounded-[10px] border border-[#252E42] bg-[#141A26] px-6 py-4">
      <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-[#8C94A8]">
        Your watchlist · today
      </p>
      <p className="text-[14px] leading-relaxed text-[#F5F6F8]/85">{narrative}</p>
    </div>
  );
}

/* ── Portfolio signals as a horizontal row of cards ── */
function SignalRow({ brief }: { brief: PortfolioBriefData }) {
  const signals = brief.signals?.slice(0, 4) ?? [];
  if (signals.length === 0) return null;

  return (
    <div>
      <p className="mb-3 text-[9px] font-semibold uppercase tracking-[0.2em] text-[#8C94A8]">
        {signals.length} key signal{signals.length !== 1 ? "s" : ""} from tikrr
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {signals.map((signal, i) => {
          const tagColor =
            signal.vibe === "positive"
              ? "text-[#22C55E] bg-[rgba(34,197,94,0.12)] border-[rgba(34,197,94,0.2)]"
              : signal.vibe === "negative"
              ? "text-[#EF4444] bg-[rgba(239,68,68,0.12)] border-[rgba(239,68,68,0.2)]"
              : "text-[#D4AF37] bg-[rgba(212,175,55,0.12)] border-[rgba(212,175,55,0.2)]";
          return (
            <div
              key={i}
              className="flex flex-col gap-2 rounded-[10px] border border-[#252E42] bg-[#141A26] p-4"
            >
              <span
                className={`self-start rounded-[4px] border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest ${tagColor}`}
              >
                {signal.tag}
              </span>
              <p className="text-[13px] font-semibold leading-snug text-[#F5F6F8]">
                {signal.headline}
              </p>
              {signal.body && (
                <p className="text-[11px] leading-relaxed text-[#8C94A8]">{signal.body}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Per-stock movers list ── */
function MoversSection({
  movers,
  stockMap,
}: {
  movers: PortfolioBriefData["movers"];
  stockMap: Map<string, { price: { changePct: number } }>;
}) {
  if (!movers || movers.length === 0) return null;
  return (
    <section className="overflow-hidden rounded-[10px] border border-[#252E42] bg-[#141A26]">
      <header className="border-b border-[#1F2738] px-5 py-3.5">
        <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#8C94A8]">
          Portfolio movers
        </p>
        <h2 className="text-[14px] font-semibold text-[#F5F6F8]">Why your stocks moved</h2>
      </header>
      <ul className="divide-y divide-[#1F2738]">
        {movers.map((mover) => {
          const stock = stockMap.get(mover.ticker.toUpperCase());
          const pct = stock?.price.changePct ?? 0;
          const pctColor =
            mover.vibe === "up" ? "text-[#22C55E]" :
            mover.vibe === "down" ? "text-[#EF4444]" :
            "text-[#D4AF37]";
          return (
            <li key={mover.ticker} className="flex items-baseline gap-4 px-5 py-3.5">
              <div className="flex w-16 shrink-0 flex-col gap-0.5">
                <span className="text-[13px] font-bold text-[#F5F6F8]">{mover.ticker}</span>
                <span className={`font-mono text-[11px] tabular-nums ${pctColor}`}>
                  {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
                </span>
              </div>
              <p className="flex-1 text-[13px] leading-relaxed text-[#F5F6F8]/70">
                {mover.oneLiner}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ── Market context — hero card, 2×2 grid ── */
function MarketContextHero({
  sections,
  bottomLine,
}: {
  sections: { label: string; text: string }[];
  bottomLine?: string;
}) {
  const all = [
    ...sections,
    ...(bottomLine ? [{ label: "Bottom line", text: bottomLine }] : []),
  ];
  if (all.length === 0) return null;
  return (
    <section className="overflow-hidden rounded-[10px] border border-[#252E42] bg-[#141A26]">
      <header className="border-b border-[#1F2738] px-6 py-4">
        <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#8C94A8]">
          Market context
        </p>
        <h2 className="text-[18px] font-bold text-[#F5F6F8]">What the market is saying</h2>
      </header>
      <div className="grid grid-cols-1 divide-y divide-[#1F2738] sm:grid-cols-2 sm:divide-y-0">
        {all.map(({ label, text }, i) => (
          <div
            key={label}
            className={`px-6 py-5 ${
              i % 2 === 0 && i < all.length - 1
                ? "sm:border-r sm:border-[#1F2738]"
                : ""
            } ${i < 2 ? "sm:border-b sm:border-[#1F2738]" : ""}`}
          >
            <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-[#8C94A8]">
              {label}
            </p>
            <p className="text-[13px] leading-relaxed text-[#F5F6F8]/80">{text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default async function SignalsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const market = readString(sp?.market) === "india" ? "india" : "us";

  const payload = await getDashboardPayload(market);

  if (!payload) {
    return (
      <Shell activeNav="signals">
        <EmptyState title="No data yet" body="Check back after the next pipeline run." />
      </Shell>
    );
  }

  const watchlistStocks = LOCAL_USER.watchlist
    .map((t) => payload.stocks.find((s) => s.symbol.toUpperCase() === t.toUpperCase()))
    .filter((s): s is NonNullable<typeof s> => s !== undefined);

  const stocksToShow = watchlistStocks.length > 0 ? watchlistStocks : payload.stocks.slice(0, 12);
  const stockMap = new Map(stocksToShow.map((s) => [s.symbol.toUpperCase(), s]));

  const brief = payload.portfolioBrief;

  const marketSections = [
    payload.view.briefOverview && { label: "Market overview", text: payload.view.briefOverview },
    payload.view.briefGlobalForces && { label: "Global forces", text: payload.view.briefGlobalForces },
    payload.view.briefOutlook && { label: "Outlook", text: payload.view.briefOutlook },
  ].filter((b): b is { label: string; text: string } => Boolean(b));

  const totalSignals = brief?.signals?.length ?? 0;

  return (
    <Shell activeNav="signals" ribbonStocks={stocksToShow} searchStocks={payload.stocks} indices={payload.view.indices}>

      {/* ─── Page header ─── */}
      <div className="mb-5 flex items-end justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8C94A8]">
            Intelligence
          </p>
          <h1 className="mt-0.5 text-[22px] font-bold tracking-tight text-[#F5F6F8]">
            Signals
          </h1>
        </div>
        {totalSignals > 0 && (
          <span className="rounded-[6px] bg-[#1A2130] px-2.5 py-1 text-[11px] font-semibold text-[#8C94A8]">
            {totalSignals} signal{totalSignals !== 1 ? "s" : ""} today
          </span>
        )}
      </div>

      <div className="flex flex-col gap-6">

        {/* 1 ── Market context — full-width hero, the centre of gravity */}
        <MarketContextHero
          sections={marketSections}
          bottomLine={payload.view.bottomLine}
        />

        {/* 2 ── Portfolio brief + key signals */}
        {brief?.narrative && <NarrativeBanner narrative={brief.narrative} />}
        {brief && <SignalRow brief={brief} />}

        {/* 3 ── Per-stock movers (left) + blind spot (right) */}
        {(brief?.movers?.length || brief?.blindSpotTitle) && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <MoversSection movers={brief?.movers ?? []} stockMap={stockMap} />
            </div>
            <div className="lg:col-span-5">
              {brief && <BlindSpotCard brief={brief} />}
            </div>
          </div>
        )}

      </div>
    </Shell>
  );
}
