import Link from "next/link";
import { CommandHeader, type CommandHeaderProps } from "@/components/radar-next/command-header";
import { Book } from "@/components/radar-next/book";
import { Health } from "@/components/radar-next/health";
import { StarterPicks } from "@/components/radar-next/starter-picks";
import { StartRadarButton } from "@/components/start-radar-button";
import {
  DEMO_HEALTH,
  DEMO_HOLDINGS,
  DEMO_WATCHING,
} from "@/lib/radar-next-demo";
import type { RadarStarterPick } from "@/lib/radar-starter-picks";

/** Signed-out: show a live sample Radar, not a feature list. */
export function RadarNextSignedOut() {
  return (
    <div className="radar-next radar-next-glow w-full px-2 pb-8 pt-3 sm:px-1 sm:pt-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span
          className="inline-flex items-center gap-2 rounded-full px-2.5 py-1 font-mono text-[10.5px] font-semibold uppercase tracking-wide shadow-[inset_0_0_0_1px_var(--rn-line)]"
          style={{ color: "var(--rn-muted)", background: "var(--rn-card-2)" }}
        >
          <span className="rn-pulse shrink-0" aria-hidden />
          sample Radar · illustrative data
        </span>
        <StartRadarButton
          surface="radar_page"
          signedOutLabel="Sign in free"
          signedInLabel="Open Radar"
          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--rn-accent)] px-3.5 py-1.5 text-[12px] font-bold text-white no-underline disabled:opacity-60 sm:px-4 sm:py-2 sm:text-[13px]"
        />
      </div>

      <div className="relative">
        <div className="pointer-events-none select-none" aria-hidden>
          <CommandHeader
            greeting="Your stock brief"
            dateLabel="SAMPLE"
            statusLine="6 tracked · 4 up / 2 down"
            trackedCount={6}
            isSubscribed={false}
          />

          <div className="mt-3 space-y-3 sm:mt-6 sm:space-y-6">
            <div className="grid gap-3 sm:gap-6 lg:grid-cols-[1.35fr_1fr]">
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
          </div>
        </div>

        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[42%] min-h-[220px] bg-gradient-to-t from-[var(--background)] via-[color-mix(in_srgb,var(--background)_88%,transparent)] to-transparent"
          aria-hidden
        />
      </div>

      <section className="relative z-10 -mt-6 mx-auto max-w-lg text-center sm:-mt-10">
        <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-[var(--rn-ink)] sm:text-[28px]">
          Keep the stocks you follow in one place.
        </h1>
        <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-[var(--rn-muted)] sm:text-[14px]">
          Add up to three stocks free. Radar keeps their latest price, call, and setup together so
          you can return when something changes.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
          <StartRadarButton
            surface="radar_page"
            signedOutLabel="Sign in and add your first stock"
            signedInLabel="Add your first stock"
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--rn-accent)] px-5 py-2.5 text-[13px] font-bold text-white no-underline disabled:opacity-60"
          />
          <Link
            href="/subscribe"
            className="inline-flex items-center rounded-full px-4 py-2.5 text-[13px] font-semibold text-[var(--rn-ink)] no-underline shadow-[inset_0_0_0_1px_var(--rn-line)]"
          >
            See Pro
          </Link>
        </div>
        <p className="mt-3 font-mono text-[10.5px] text-[var(--rn-muted)]">
          Free for 3 stocks · no card required
        </p>
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
    <div className="radar-next radar-next-glow w-full space-y-6 px-2 pb-8 pt-6 sm:px-1 sm:pt-10">
      <CommandHeader {...header} />

      <section className="rn-window">
        <div className="px-4 py-8 sm:px-8 sm:py-10">
          <span className="rn-kick">// start here</span>
          <h2 className="mt-3 text-[22px] font-extrabold tracking-tight text-[var(--rn-ink)] sm:text-[28px]">
            Add your first stock
          </h2>
          <p className="mt-2 max-w-lg text-[13.5px] leading-relaxed text-[var(--rn-muted)]">
            This is the fastest way to make Radar useful. Pick a stock you own or watch, then Radar will keep its price and setup in one place.
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
