import Link from "next/link";
import { CommandHeader, type CommandHeaderProps } from "@/components/radar-next/command-header";
import { DecisionQueue } from "@/components/radar-next/decision-queue";
import { Book } from "@/components/radar-next/book";
import { Health } from "@/components/radar-next/health";
import { StarterPicks } from "@/components/radar-next/starter-picks";
import { StartRadarButton } from "@/components/start-radar-button";
import {
  DEMO_HEALTH,
  DEMO_HOLDINGS,
  DEMO_WATCHING,
  DEMO_DECISIONS,
} from "@/lib/radar-next-demo";
import type { RadarStarterPick } from "@/lib/radar-starter-picks";

/** Signed-out: show a live sample Watchlist, not a feature list. */
export function RadarNextSignedOut() {
  return (
    <div className="radar-next mx-auto w-full max-w-[1240px] space-y-10 px-4 pb-10 pt-3 sm:space-y-14 sm:px-6 sm:pt-6">
      <CommandHeader
        greeting="This is what a live Watchlist looks like"
        dateLabel="Sample data"
        statusLine="6 tracked · 3 decisions · 4 open checkpoints"
        trackedCount={6}
        isSubscribed={false}
        mode="sample"
        actions={
          <StartRadarButton
            surface="radar_page"
            signedOutLabel="Track 3 stocks free"
            signedInLabel="Open Watchlist"
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--rn-ink)] px-4 py-2 text-[12px] font-bold text-[var(--rn-card)] no-underline disabled:opacity-60"
          />
        }
      />

      <DecisionQueue items={DEMO_DECISIONS} openLoops={4} />
      <Book holdings={DEMO_HOLDINGS} watching={DEMO_WATCHING} />
      <Health
        grade={DEMO_HEALTH.grade}
        gradePct={DEMO_HEALTH.gradePct}
        headline={DEMO_HEALTH.headline}
        body={DEMO_HEALTH.body}
        fixes={DEMO_HEALTH.fixes}
        pillars={DEMO_HEALTH.pillars}
      />

      <section className="rounded-2xl bg-[var(--rn-ink)] px-5 py-7 text-center text-[var(--rn-card)] sm:px-8 sm:py-9">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] opacity-65">Make it yours</span>
        <h2 className="mx-auto mt-2 max-w-xl text-[24px] font-extrabold leading-tight tracking-[-0.035em] sm:text-[32px]">
          Keep the stocks you follow in one place.
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-[13px] leading-relaxed opacity-70">
          Add up to three stocks free. Your Watchlist keeps their price, research and important changes together.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
          <StartRadarButton
            surface="radar_page"
            signedOutLabel="Track 3 stocks free"
            signedInLabel="Add my first stock"
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--rn-card)] px-5 py-2.5 text-[13px] font-bold text-[var(--rn-ink)] no-underline disabled:opacity-60"
          />
          <Link href="/subscribe" className="rounded-full px-4 py-2.5 text-[12.5px] font-semibold text-[var(--rn-card)] no-underline shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--rn-card)_25%,transparent)]">
            See Pro
          </Link>
        </div>
        <p className="mt-3 font-mono text-[10px] opacity-55">Free for 3 stocks · no payment details</p>
      </section>
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
          <span className="rn-kick">Start here</span>
          <h2 className="mt-3 text-[22px] font-extrabold tracking-tight text-[var(--rn-ink)] sm:text-[28px]">
            Add a stock you own or genuinely watch
          </h2>
          <p className="mt-2 max-w-lg text-[13.5px] leading-relaxed text-[var(--rn-muted)]">
            Your Watchlist keeps its live price, latest research and important changes in one place.
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
