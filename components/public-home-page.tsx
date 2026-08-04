import { Suspense } from "react";

import { FeedbackWidget } from "@/components/feedback-widget";
import { LandingSimpleWay } from "@/components/landing-simple-way";
import { TerminalLandingFaq } from "@/components/terminal-landing-faq";
import { TerminalLandingTestimonials } from "@/components/terminal-landing-testimonials";
import {
  LandingHeroSkeleton,
  LandingPricingSkeleton,
  LandingScannerRedditSkeleton,
  LandingTapeSkeleton,
} from "@/components/terminal-landing-skeleton";
import {
  LandingHeroStream,
  LandingProSectionStream,
  LandingScannerRedditStream,
  LandingTapeStream,
} from "@/components/terminal-landing-streams";

export function PublicHomePage() {
  return (
    <main className="min-w-0 flex-grow">
      <div className="landing-page bg-background text-on-surface">
        <Suspense fallback={<LandingTapeSkeleton />}>
          <LandingTapeStream />
        </Suspense>

        <header className="landing-hero-glow relative border-b border-outline-variant">
          <div className="landing-inner py-10 sm:py-14 lg:py-16">
            <Suspense fallback={<LandingHeroSkeleton />}>
              <LandingHeroStream />
            </Suspense>
          </div>
        </header>

        <LandingSimpleWay />

        <Suspense fallback={<LandingScannerRedditSkeleton />}>
          <LandingScannerRedditStream />
        </Suspense>

        <Suspense fallback={<LandingPricingSkeleton />}>
          <LandingProSectionStream />
        </Suspense>

        <TerminalLandingTestimonials />
        <TerminalLandingFaq />
      </div>

      <FeedbackWidget />
    </main>
  );
}
