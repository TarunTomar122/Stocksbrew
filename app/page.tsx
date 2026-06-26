import { Suspense } from "react";
import { FeedbackWidget } from "@/components/feedback-widget";
import { NewsletterModal } from "@/components/newsletter-modal";
import { TerminalLandingHeroCopy } from "@/components/terminal-landing-hero-copy";
import { TerminalLandingTestimonials } from "@/components/terminal-landing-testimonials";
import {
  LandingHeroCommandSkeleton,
  LandingScannerRedditSkeleton,
  LandingSectorHeatSkeleton,
  LandingTapeSkeleton,
} from "@/components/terminal-landing-skeleton";
import {
  LandingHeroCommandStream,
  LandingProSectionStream,
  LandingScannerRedditStream,
  LandingSectorHeatStream,
  LandingTapeStream,
} from "@/components/terminal-landing-streams";

export default function HomePage() {
  return (
    <main className="min-w-0 flex-grow">
      <div className="landing-page bg-background text-on-surface">
        <Suspense fallback={<LandingTapeSkeleton />}>
          <LandingTapeStream />
        </Suspense>

        <header className="landing-hero-glow relative border-b border-outline-variant">
          <div className="landing-inner grid min-w-0 items-center gap-8 py-10 sm:gap-12 sm:py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.12fr)] lg:gap-14 lg:py-24">
            <div className="min-w-0">
              <TerminalLandingHeroCopy />
            </div>
            <div className="min-w-0">
              <Suspense fallback={<LandingHeroCommandSkeleton />}>
                <LandingHeroCommandStream />
              </Suspense>
            </div>
          </div>
        </header>

        <Suspense fallback={<LandingScannerRedditSkeleton />}>
          <LandingScannerRedditStream />
        </Suspense>

        <Suspense fallback={<LandingSectorHeatSkeleton />}>
          <LandingSectorHeatStream />
        </Suspense>

        <Suspense fallback={null}>
          <LandingProSectionStream />
        </Suspense>
        <TerminalLandingTestimonials />
      </div>

      <FeedbackWidget />
      <NewsletterModal />
    </main>
  );
}
