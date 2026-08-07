"use client";

import { AnimatedIcon } from "@/components/animated-icon";

import Link from "next/link";
import { MoversScanner, type ScannerItem } from "@/components/movers-scanner";
import { RedditBuzzFeed, redditPickToTicker } from "@/components/reddit-buzz-feed";
import { RedditMark } from "@/components/reddit-mark";

const HOMEPAGE_UNLOCK_LABEL = "Start your 3-day free trial";

type RedditPick = {
  ticker: string;
  sentiment: string;
  summary: string;
  mention_count?: number;
  catalysts?: string[];
  company?: string;
  price?: number;
  changePct?: number;
  volume?: number;
};

function formatDataDate(raw?: string) {
  if (!raw?.trim()) return null;
  const d = new Date(raw.includes("T") ? raw : `${raw}T12:00:00`);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function SectionHeader({
  icon,
  tone,
  title,
}: {
  icon: string;
  tone: "scanner" | "reddit";
  title: string;
}) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <div className={`landing-section-icon landing-section-icon--${tone}`}>
        {tone === "reddit" ? (
          <RedditMark size={20} />
        ) : (
          <AnimatedIcon name={icon} size={20} className="text-[20px]" aria-hidden />
        )}
      </div>
      <h2 className="text-[20px] font-semibold tracking-tight text-on-surface sm:text-[22px]">{title}</h2>
    </div>
  );
}

export function LandingScannerReddit({
  scannerItems,
  redditPicks,
  dataAsOf,
  signedIn = false,
  isSubscribed = false,
  trackedIds = [],
}: {
  scannerItems: ScannerItem[];
  redditPicks: RedditPick[];
  dataAsOf?: string;
  signedIn?: boolean;
  isSubscribed?: boolean;
  trackedIds?: string[];
}) {
  const dataLabel = formatDataDate(dataAsOf);

  return (
    <section className="border-b border-outline-variant bg-background">
      <div className="landing-inner py-16 lg:py-20">
        <div className="landing-card overflow-clip">
          <div className="grid min-w-0 lg:grid-cols-2">
            <div className="min-w-0 border-b border-outline-variant p-5 md:p-6 lg:border-b-0 lg:border-r">
              <SectionHeader icon="trending_up" tone="scanner" title="Today's movers, and why" />
              <MoversScanner
                items={scannerItems}
                limit={8}
                showCount={false}
                embedded
                trackedIds={trackedIds}
                isSubscribed={isSubscribed}
                trackedCount={trackedIds.length}
                showUnlockCta={false}
              />
            </div>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col p-5 md:p-6">
              <SectionHeader icon="forum" tone="reddit" title="What the crowd's saying" />
              <div className="flex min-h-0 flex-1 flex-col">
                {redditPicks.length > 0 ? (
                  <RedditBuzzFeed
                    items={redditPicks.map(redditPickToTicker)}
                    isSubscribed={isSubscribed}
                    signedIn={signedIn}
                    variant="landing"
                    gridCols="1"
                    showTalkingPoints={false}
                    hideLockedRows
                    unlockSignedOutLabel={HOMEPAGE_UNLOCK_LABEL}
                    showUnlockCta={false}
                  />
                ) : (
                  <Link
                    href="/explore"
                    className="landing-reddit-card text-[13px] text-on-surface-variant"
                  >
                    See what retail is debating on r/stocks →
                  </Link>
                )}
              </div>
            </div>
          </div>

          <footer className="flex flex-col gap-2 border-t border-outline-variant px-5 py-4 text-[12px] text-on-surface-variant sm:flex-row sm:items-center sm:justify-between md:px-6">
            <div className="flex items-center gap-2">
              <AnimatedIcon name="lightbulb" size={16} className="text-[16px] text-on-surface-variant" />
              A live look at unusual moves and the conversations around them.
            </div>
            {dataLabel ? <p className="shrink-0 sm:text-right">Data as of {dataLabel}</p> : null}
          </footer>
        </div>
      </div>
    </section>
  );
}
