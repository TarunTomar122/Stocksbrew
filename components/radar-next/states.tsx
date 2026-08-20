import { CommandHeader, type CommandHeaderProps } from "@/components/radar-next/command-header";
import { Book } from "@/components/radar-next/book";
import { Health } from "@/components/radar-next/health";
import { StarterPicks } from "@/components/radar-next/starter-picks";
import { StartRadarButton } from "@/components/start-radar-button";
import { DEMO_HEALTH, DEMO_HOLDINGS, DEMO_WATCHING } from "@/lib/radar-next-demo";
import type { RadarStarterPick } from "@/lib/radar-starter-picks";

/** Signed-out: show a live sample Watchlist, not a feature list. */
export function RadarNextSignedOut() {
  return (
    <div className="radar-next mx-auto w-full max-w-[1240px] space-y-10 px-4 pb-10 pt-3 sm:space-y-14 sm:px-6 sm:pt-6">
      <CommandHeader
        trackedCount={6}
        isSubscribed={false}
        mode="sample"
        actions={
          <StartRadarButton
            surface="radar_page"
            signedOutLabel="Track 3 stocks free"
            signedInLabel="Open Watchlist"
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-[12px] font-semibold text-on-primary no-underline disabled:opacity-60"
          />
        }
      />

      <div className="relative max-h-[48rem] overflow-hidden rounded-2xl border border-[var(--rn-line)] bg-[var(--rn-card-2)]">
        <div aria-hidden className="pointer-events-none select-none space-y-10 p-4 opacity-75 blur-[1.5px] sm:space-y-14 sm:p-7">
          <Book holdings={DEMO_HOLDINGS} watching={DEMO_WATCHING} />
          <Health
            grade={DEMO_HEALTH.grade}
            gradePct={DEMO_HEALTH.gradePct}
            headline={DEMO_HEALTH.headline}
            body={DEMO_HEALTH.body}
            fixes={DEMO_HEALTH.fixes}
            pillars={DEMO_HEALTH.pillars}
          />
        </div>
        <div aria-hidden className="rn-sample-fade absolute inset-0" />
        <section aria-label="Sample Watchlist notice" className="absolute inset-x-4 top-8 z-10 mx-auto max-w-[27rem] rounded-2xl border border-[var(--rn-line)] bg-[var(--rn-card)] p-7 text-center shadow-[0_22px_60px_rgba(0,0,0,0.24)] sm:top-12 sm:p-8">
          <h2 className="text-[26px] font-semibold leading-tight tracking-tight text-[var(--rn-ink)]">
            Build your watchlist
          </h2>
          <p className="mt-3 text-[14px] leading-relaxed text-[var(--rn-muted)]">
            Add the stocks you care about and keep their prices, decisions and checkpoints in one place.
          </p>
          <div className="mt-5 flex justify-center">
            <StartRadarButton
              surface="radar_page"
              signedOutLabel="Build my watchlist"
              signedInLabel="Open my watchlist"
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-[13px] font-semibold text-on-primary no-underline disabled:opacity-60"
            />
          </div>
          <p className="mt-3 text-[12.5px] text-[var(--rn-muted)]">3 stocks free · no payment details</p>
        </section>
      </div>
    </div>
  );
}

type RadarNextEmptyProps = {
  header: CommandHeaderProps;
  picks: RadarStarterPick[];
  trackedIds: string[];
};

/** Signed-in but tracking nothing yet. */
export function RadarNextEmpty({ header, picks, trackedIds }: RadarNextEmptyProps) {
  return (
    <div className="radar-next mx-auto w-full max-w-[1240px] space-y-10 px-4 pb-8 pt-3 sm:px-6 sm:pt-6">
      <CommandHeader {...header} />

      <section className="rounded-2xl bg-[var(--rn-card)] px-4 py-8 shadow-[inset_0_0_0_1px_var(--rn-line)] sm:px-8 sm:py-10">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-[24px] font-semibold tracking-tight text-[var(--rn-ink)] sm:text-[28px]">
            Add a stock you own or genuinely watch
          </h2>
          <p className="mt-2.5 max-w-lg text-[14.5px] leading-relaxed text-[var(--rn-muted)]">
            Your watchlist keeps its live price, latest research and important changes in one place.
          </p>
          <StarterPicks
            picks={picks}
            isSubscribed={header.isSubscribed}
            trackedCount={header.trackedCount}
            trackedIds={trackedIds}
          />
        </div>
      </section>
    </div>
  );
}
