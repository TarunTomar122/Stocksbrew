import type { Metadata } from "next";
import { IpoCalendar } from "@/components/ipo-calendar";

export const metadata: Metadata = {
  title: "IPO Calendar | stocksbrew",
  description: "Upcoming IPOs for US markets. See pricing dates, price ranges, and exchanges for newly listed companies.",
  openGraph: {
    title: "IPO Calendar | stocksbrew",
    description: "Upcoming IPOs for US markets. See pricing dates, price ranges, and exchanges for newly listed companies.",
  },
};

export default function IposPage() {
  return (
    <main className="flex-grow">
      <div className="mx-auto w-full max-w-screen-xl px-6 py-12 md:px-10 lg:px-16 flex flex-col gap-8">
        <header className="flex flex-col gap-2 max-w-[720px]">
          <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#6b7280]">
            Free tool
          </span>
          <h1 className="text-[36px] md:text-[44px] font-semibold tracking-[-0.03em] text-[#111111] leading-[1.1]">
            IPO Calendar
          </h1>
          <p className="text-[16px] text-[#374151] leading-[1.55]">
            Track upcoming initial public offerings. See pricing dates, estimated price ranges, and which exchange each company is listing on.
          </p>
        </header>

        <IpoCalendar />
      </div>
    </main>
  );
}
