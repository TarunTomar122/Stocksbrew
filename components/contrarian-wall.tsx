import Link from "next/link";
import { StockLogo } from "@/components/stock-logo";
import { ContrarianXray } from "@/components/contrarian-xray";
import type { ContrarianCard } from "@/lib/contrarian";

function stanceTone(side: "bull" | "bear"): { text: string; bg: string } {
  return side === "bull"
    ? { text: "#047857", bg: "#ecfdf5" }
    : { text: "#b91c1c", bg: "#fef2f2" };
}

function crowdDot(side: "bull" | "bear"): string {
  return side === "bull" ? "🟢" : "🔴";
}

function Card({ card }: { card: ContrarianCard }) {
  const us = stanceTone(card.our_side);
  return (
    <Link
      href={`/stock/${encodeURIComponent(card.ticker)}`}
      className="group flex flex-col gap-2.5 rounded-2xl border border-[#e5e7eb] bg-white p-4 text-left transition-all hover:border-[#111111] hover:shadow-sm"
    >
      <div className="flex items-center gap-2.5">
        <StockLogo ticker={card.ticker} market="US" size={32} />
        <div className="flex min-w-0 flex-col">
          <span className="text-[13px] font-semibold tracking-[-0.01em] text-[#111111] group-hover:text-[#0052ff] transition-colors">
            {card.ticker}
          </span>
          <span className="truncate max-w-[150px] text-[11px] text-[#9ca3af]">{card.name}</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 text-[12px]">
        <span className="text-[#6b7280]">
          Crowd <span className="font-semibold text-[#374151]">{crowdDot(card.crowd_side)} {card.crowd_label}</span>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#6b7280]">Us</span>
        <span
          className="rounded-md px-2 py-0.5 text-[12px] font-bold uppercase tracking-[0.04em]"
          style={{ background: us.bg, color: us.text }}
        >
          {card.our_stance}
        </span>
      </div>

      <p className="text-[12px] leading-snug text-[#6b7280]">{card.reason}</p>
    </Link>
  );
}

export function ContrarianWall({ cards }: { cards: ContrarianCard[] }) {
  if (!cards || cards.length < 4) return null;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[#0052ff]">
          Where the crowd is wrong
        </span>
        <h2 className="text-[26px] md:text-[34px] font-semibold tracking-[-0.02em] text-[#111111] leading-tight max-w-2xl">
          Everyone is bullish. Here is where we disagree.
        </h2>
        <p className="max-w-xl text-[14px] leading-relaxed text-[#6b7280]">
          The uncomfortable call, not the easy one. We tell you where Wall Street and the crowd
          are offside, and what we would actually do.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.slice(0, 8).map((card) => (
          <Card key={card.ticker} card={card} />
        ))}
      </div>

      <ContrarianXray />
    </section>
  );
}
