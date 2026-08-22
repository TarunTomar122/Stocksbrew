import type { Metadata } from "next";
import { HackathonWorkspace } from "@/hackathon/frontend/hackathon-workspace";
import { seedThesis } from "@/hackathon/seed";
import { OaSiteHeader } from "@/components/oa/oa-site-header";

export const metadata: Metadata = {
  title: "Thesis Tracker — Hackathon",
  description: "Track, score, and evidence-map investment theses.",
  robots: { index: false },
};

export default function HackathonPage() {
  return (
    <main className="flex-grow">
      <OaSiteHeader />
      <div className="mx-auto w-full max-w-[1440px] px-5 sm:px-8 md:px-10 lg:px-14 xl:px-16 py-10 md:py-14 lg:py-16">
        <HackathonWorkspace defaultRawText={seedThesis.rawText} />
      </div>
    </main>
  );
}
