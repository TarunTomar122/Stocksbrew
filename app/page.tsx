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
    <main className="flex-grow">
      <div className="landing-page bg-background text-on-surface">
        <Suspense fallback={<LandingTapeSkeleton />}>
          <LandingTapeStream />
        </Suspense>

        <header className="landing-hero-glow relative border-b border-outline-variant">
          <div className="landing-inner grid items-center gap-12 py-16 md:py-24 lg:grid-cols-[1fr_1.12fr] lg:gap-14">
            <TerminalLandingHeroCopy />
            <Suspense fallback={<LandingHeroCommandSkeleton />}>
              <LandingHeroCommandStream />
            </Suspense>
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
