import type { Metadata } from "next";

import { FreeToolsHub } from "@/components/free-tools-hub";
import { MarketingSchema } from "@/components/seo/marketing-schema";

export const metadata: Metadata = {
  title: "Free stock research tools",
  description:
    "Should I Buy, compare stocks, portfolio analyzer, market heat, screens, news, Trump Logic, IPO calendar, and more — free US stock tools in one place.",
  alternates: { canonical: "/free-tools" },
  openGraph: {
    title: "Free stock research tools · stocksbrew",
    description: "Free checkers, scanners, and calculators for US stock research.",
    url: "https://www.stocksbrew.online/free-tools",
  },
};

export default function FreeToolsPage() {
  return (
    <main className="flex-grow">
      <MarketingSchema
        path="/free-tools"
        name="Free stock research tools"
        description="Free US stock research tools from stocksbrew."
        breadcrumbLabel="Free tools"
      />
      <FreeToolsHub />
    </main>
  );
}
