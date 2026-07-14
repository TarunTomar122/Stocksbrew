import Link from "next/link";
import { CommandHeader, type CommandHeaderProps } from "@/components/radar-next/command-header";
import { Book } from "@/components/radar-next/book";
import { Health } from "@/components/radar-next/health";
import { StarterPicks } from "@/components/radar-next/starter-picks";
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
          sample book · refreshed this morning
        </span>
        <Link
          href="/login"
          className="inline-flex items-center rounded-full px-3.5 py-1.5 text-[12px] font-bold no-underline sm:px-4 sm:py-2 sm:text-[13px]"
          style={{ color: "var(--landing-on-brand, #fff)", background: "var(--rn-accent)" }}
        >
          Sign in free →
        </Link>
      </div>

      <div className="relative">
        <div className="pointer-events-none select-none" aria-hidden>
          <CommandHeader
            greeting="Good morning"
            dateLabel="TUE, JUL 14"
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
          This is what your Radar looks like every morning.
        </h1>
        <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-[var(--rn-muted)] sm:text-[14px]">
          Add the stocks you own or watch. We score the tape overnight and surface what needs a
          call, highlighted right in your book, plus a health grade on your portfolio.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
          <Link
            href="/login"
            className="inline-flex items-center rounded-full px-5 py-2.5 text-[13px] font-bold no-underline"
            style={{ color: "var(--landing-on-brand, #fff)", background: "var(--rn-accent)" }}
          >
            Sign in to open your Radar →
          </Link>
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

const EMPTY_ZONES: Array<{ tag: string; title: string; body: string }> = [
  { tag: "book", title: "Holdings & watching", body: "Your whole book, live prices. Names that need a call today are highlighted." },
  { tag: "health", title: "Book health grade", body: "An A to F read on valuation, growth, quality, momentum." },
  { tag: "ideas", title: "Ideas to buy", body: "Fresh names that fit your book, top-rated, or moving unusually." },
];

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
            Add your first stocks
          </h2>
          <p className="mt-2 max-w-lg text-[13.5px] leading-relaxed text-[var(--rn-muted)]">
            Popular picks to get going. Radar starts tracking as soon as you add them.
          </p>
          <StarterPicks
            picks={picks}
            isSubscribed={header.isSubscribed}
            trackedCount={header.trackedCount}
            trackedIds={trackedIds}
          />
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        {EMPTY_ZONES.map((z) => (
          <div key={z.tag} className="rn-card p-4">
            <span className="rn-kick">// {z.tag}</span>
            <p className="mt-2 text-[13px] font-bold text-[var(--rn-ink)]">{z.title}</p>
            <p className="mt-1 text-[12px] leading-relaxed text-[var(--rn-muted)]">{z.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
