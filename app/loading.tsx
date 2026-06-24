import { TerminalLandingHeroCopy } from "@/components/terminal-landing-hero-copy";
import { TerminalLandingProSection } from "@/components/terminal-landing-pro-section";
import { TerminalLandingTestimonials } from "@/components/terminal-landing-testimonials";
import {
  LandingHeroCommandSkeleton,
  LandingScannerRedditSkeleton,
  LandingSectorHeatSkeleton,
  LandingTapeSkeleton,
} from "@/components/terminal-landing-skeleton";

export default function HomeLoading() {
  return (
    <main className="flex-grow">
      <div className="landing-page bg-background text-on-surface">
        <LandingTapeSkeleton />

        <header className="landing-hero-glow relative border-b border-outline-variant">
          <div className="landing-inner grid items-center gap-12 py-16 md:py-24 lg:grid-cols-[1fr_1.12fr] lg:gap-14">
            <TerminalLandingHeroCopy />
            <LandingHeroCommandSkeleton />
          </div>
        </header>

        <LandingScannerRedditSkeleton />
        <LandingSectorHeatSkeleton />

        <TerminalLandingProSection />
        <TerminalLandingTestimonials />
      </div>
    </main>
  );
}
