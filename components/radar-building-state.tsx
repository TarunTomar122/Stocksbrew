import { AnimatedIcon } from "@/components/animated-icon";
import { BuildingStateRefresher } from "@/components/building-state-refresher";

/** Shown while the per-user watchlist view is still materializing. */
export function RadarBuildingState({ trackedCount }: { trackedCount: number }) {
  return (
    <main className="flex-grow">
      <div className="mx-auto w-full min-w-0 max-w-screen-2xl px-3 sm:px-6 md:px-10 lg:px-12 xl:px-20 2xl:px-32 py-10 md:py-12 flex flex-col gap-8">
        <header className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold tracking-[0.18em] uppercase text-on-surface-variant">
            stocksbrew · Radar
          </span>
          <h1 className="text-[32px] md:text-[40px] font-semibold tracking-[-0.025em] text-on-surface leading-none">
            Radar
          </h1>
        </header>
        <div className="rounded-3xl border border-outline-variant bg-surface p-10 md:p-14 flex flex-col items-center gap-5 text-center">
          <div className="relative flex h-16 w-16 items-center justify-center">
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#0052ff] opacity-10"
              style={{ animationDuration: "1.8s" }}
            />
            <span
              className="absolute inline-flex h-12 w-12 animate-ping rounded-full bg-[#0052ff] opacity-15"
              style={{ animationDuration: "1.8s", animationDelay: "0.3s" }}
            />
            <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-full tint-info">
              <AnimatedIcon name="radar" size={18} className="text-[#22d3ee]" aria-hidden />
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-[20px] font-semibold tracking-[-0.01em] text-on-surface">
              Building your Radar…
            </p>
            <p className="text-[14px] text-on-surface-variant leading-relaxed max-w-sm">
              We&apos;re fetching prices, running analysis, and setting up alerts for your {trackedCount}{" "}
              {trackedCount === 1 ? "stock" : "stocks"}. This usually takes under a minute.
            </p>
          </div>
          <BuildingStateRefresher />
        </div>
      </div>
    </main>
  );
}
