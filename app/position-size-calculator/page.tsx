import type { Metadata } from "next";
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
      <div className="mx-auto w-full max-w-screen-xl px-6 py-12 md:px-10 lg:px-16 flex flex-col gap-8">
        <header className="flex flex-col gap-2 max-w-[720px]">
          <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#6b7280]">
            Free tool
          </span>
          <h1 className="text-[36px] md:text-[44px] font-semibold tracking-[-0.03em] text-[#111111] leading-[1.1]">
            Position Size Calculator
          </h1>
          <p className="text-[16px] text-[#374151] leading-[1.55]">
            Compute the right position size for any trade based on your account
            size, risk tolerance, and stop-loss level. No sign-up required.
          </p>
        </header>

        <PositionSizeCalculator />
      </div>
    </main>
  );
}
