import type { Metadata } from "next";

import { FreeToolPageFrame } from "@/components/marketing/free-tool-chrome";
import { PositionSizeCalculator } from "@/components/position-size-calculator";

export const metadata: Metadata = {
  title: "Position Size Calculator | stocksbrew",
  description:
    "Free position size calculator for stocks. Compute shares, dollar risk, portfolio allocation, and risk/reward ratio based on your account size and stop-loss.",
  alternates: { canonical: "/position-size-calculator" },
  openGraph: {
    title: "Position Size Calculator | stocksbrew",
    description:
      "Free position size calculator for stocks. Compute shares, dollar risk, portfolio allocation, and risk/reward ratio based on your account size and stop-loss.",
    url: "https://www.stocksbrew.online/position-size-calculator",
  },
};

export default function PositionSizeCalculatorPage() {
  return (
    <main className="flex-grow">
      <FreeToolPageFrame toolHref="/position-size-calculator">
        <PositionSizeCalculator />
      </FreeToolPageFrame>
    </main>
  );
}
