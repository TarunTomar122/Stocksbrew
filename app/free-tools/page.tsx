import type { Metadata } from "next";

import { FreeToolsHub } from "@/components/free-tools-hub";
import { OaSiteHeader } from "@/components/oa/oa-site-header";
import { MarketingSchema } from "@/components/seo/marketing-schema";

export const metadata: Metadata = {
  title: "Free Stock Analysis Tools: Screeners, Alerts & Calculators",
  description:
    "Free US stock analysis tools for screening, comparison, portfolio checks, market heat, news, IPOs, and position sizing. No credit card required.",
  alternates: { canonical: "/free-tools" },
  openGraph: {
    title: "Free Stock Analysis Tools: Screeners, Alerts & Calculators · stocksbrew",
    description: "Free checkers, scanners, and calculators for US stock research.",
    url: "https://www.stocksbrew.online/free-tools",
  },
};

export default function FreeToolsPage() {
  return (
    <main className="oa-landing flex-grow">
      <MarketingSchema
        path="/free-tools"
        name="Free stock analysis tools"
        description="Free US stock analysis tools for screening, comparison, portfolio checks, market heat, news, IPOs, and position sizing."
        breadcrumbLabel="Free tools"
      />
      <OaSiteHeader />
      <FreeToolsHub />
    </main>
  );
}
