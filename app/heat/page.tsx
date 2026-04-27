import type { ReactNode } from "react";

import { getCurrentMarket } from "@/lib/market";
import { getHeatList, type HeatList } from "@/lib/heat";
import { getDivergenceList, type DivergenceList } from "@/lib/divergence";
import { HeatListView } from "@/components/heat-list";
import { DivergenceListView } from "@/components/divergence-list";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Heat · Tikrr",
  description:
    "Stocks with the biggest spike in news chatter vs. their own baseline — plus breakout and sentiment confirms.",
};

function formatGeneratedAt(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type Props = {
  searchParams?: Promise<{ tab?: string }>;
};

export default async function HeatPage({ searchParams }: Props) {
  const params = searchParams ? await searchParams : {};
  const activeTab = params.tab === "divergence" ? "divergence" : "heat";
  const market = getCurrentMarket();
  let data: HeatList | null = null;
  let divergence: DivergenceList | null = null;
  if (activeTab === "divergence") {
    divergence = await getDivergenceList(market);
  } else {
    data = await getHeatList(market);
  }
  const generatedAt = formatGeneratedAt(data?.generated_at);
  const divergenceGeneratedAt = formatGeneratedAt(divergence?.generated_at);
  const displayGeneratedAt = activeTab === "divergence" ? divergenceGeneratedAt : generatedAt;

  return (
    <main className="flex-grow">
      <div className="mx-auto w-full max-w-screen-2xl px-8 py-10 flex flex-col gap-6">
        <header className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold tracking-[0.18em] uppercase px-2 py-0.5 bg-gradient-to-r from-indigo-500/20 via-violet-500/20 to-fuchsia-500/20 text-primary border border-primary/40">
                ✦ House Signal
              </span>
            </div>
            <h1 className="text-2xl font-bold text-on-surface mt-2">Heat list</h1>
            <p className="text-sm text-on-surface-variant mt-1">
              The 10 names most worth a look today, ranked by momentum, RSI,
              price action, news velocity, and catalysts.
            </p>
          </div>
          {displayGeneratedAt && (
            <div className="text-[11px] font-semibold tracking-[0.14em] uppercase text-on-surface-variant">
              Updated {displayGeneratedAt} · {market}
            </div>
          )}
        </header>

        <div className="flex items-center gap-2 border-b border-outline-variant/20">
          <TabLink href="/heat" active={activeTab === "heat"}>
            Hot Stocks
          </TabLink>
          <TabLink href="/heat?tab=divergence" active={activeTab === "divergence"}>
            Divergences
          </TabLink>
        </div>

        {activeTab === "divergence" ? (
          <DivergenceListView data={divergence} />
        ) : (
          <HeatListView data={data} />
        )}

        <footer className="text-[11px] text-on-surface-variant">
          Heat score 0-100 · not investment advice.
        </footer>
      </div>
    </main>
  );
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      className={`-mb-px border-b-2 px-1 pb-3 text-[11px] font-black tracking-[0.18em] uppercase transition-colors ${
        active
          ? "border-primary text-primary"
          : "border-transparent text-on-surface-variant hover:text-on-surface"
      }`}
    >
      {children}
    </a>
  );
}
