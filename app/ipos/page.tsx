import { OaSiteHeader } from "@/components/oa/oa-site-header";
import type { Metadata } from "next";

import { FreeToolPageFrame } from "@/components/marketing/free-tool-chrome";
import { IpoCalendar } from "@/components/ipo-calendar";

export const metadata: Metadata = {
  title: "IPO Calendar",
  description:
    "Upcoming IPOs for US markets. See pricing dates, price ranges, and exchanges for newly listed companies.",
  alternates: { canonical: "/ipos" },
  openGraph: {
    title: "IPO Calendar | stocksbrew",
    description:
      "Upcoming IPOs for US markets. See pricing dates, price ranges, and exchanges for newly listed companies.",
    url: "https://www.stocksbrew.online/ipos",
  },
};

export default function IposPage() {
  return (
    <main className="oa-landing flex-grow">
      <OaSiteHeader />
      <FreeToolPageFrame toolHref="/ipos">
        <IpoCalendar />
      </FreeToolPageFrame>
    </main>
  );
}
