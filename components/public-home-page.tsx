import { Suspense } from "react";

import { AgentAccessLandingStrip } from "@/components/agent-access-marketing";
import { FeedbackWidget } from "@/components/feedback-widget";
import { NewsletterModal } from "@/components/newsletter-modal";
import { TerminalLandingFaq } from "@/components/terminal-landing-faq";
import { TerminalLandingTestimonials } from "@/components/terminal-landing-testimonials";
import {
  LandingHeroSkeleton,
  LandingScannerRedditSkeleton,
  LandingSectorHeatSkeleton,
  LandingTapeSkeleton,
} from "@/components/terminal-landing-skeleton";
import {
  LandingHeroStream,
  LandingProSectionStream,
  LandingScannerRedditStream,
  LandingSectorHeatStream,
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
          <div className="landing-inner py-10 sm:py-14 lg:py-20">
            <Suspense fallback={<LandingHeroSkeleton />}>
              <LandingHeroStream />
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
        <TerminalLandingFaq />
        <AgentAccessLandingStrip />
      </div>

      <FeedbackWidget />
      <NewsletterModal />
    </main>
  );
}
