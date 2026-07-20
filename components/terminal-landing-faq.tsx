"use client";

import { useId, useState } from "react";

type FaqItem = { q: string; a: string };

const FAQS: FaqItem[] = [
  {
    q: "What do I get for free?",
    a: "Search stocks, follow the market, and track up to 3 names on Radar. Free users can preview the product. Detailed calls and zones, the Stocksbrew target price, and alerts are Pro.",
  },
  {
    q: "Free or Pro: which should I pick?",
    a: "Start free if you are exploring a few names. Go Pro when you want a repeatable workflow: read the detailed call and target, track the stock on Radar, and get automatic or manual alerts.",
  },
  {
    q: "What does Pro actually add?",
    a: "Detailed add, hold, or trim calls with zones, drivers, and risks; the Stocksbrew target price; unlimited Radar and alerts; plus current stock context for your AI agent.",
  },
  {
    q: "Can I use Stocksbrew in Claude Code, Cursor, or Codex?",
    a: "Yes. Pro includes a read-only MCP server and REST API. A compatible agent can retrieve current Stocksbrew calls, targets, drivers, risks, and freshness. It cannot trade or change your account.",
  },
  {
    q: "Is there a free trial?",
    a: "Yes on yearly. You get 3 days of full Pro access. Monthly starts right away. Either way, cancel in one click.",
  },
  {
    q: "Is this investment advice?",
    a: "No. StocksBrew is research and opinion to help you decide faster. You make the call. We are not a broker and we do not touch your money.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. One click, no questions asked, and you keep access until the period you paid for runs out.",
  },
  {
    q: "Which markets do you cover?",
    a: "US markets today, with more on the way. Everything you see on the site runs on real, current data.",
  },
];

function FaqRow({ item, open, onToggle }: { item: FaqItem; open: boolean; onToggle: () => void }) {
  const panelId = useId();
  const buttonId = useId();

  return (
    <div className={`landing-faq-item ${open ? "landing-faq-item-open" : ""}`}>
      <button
        type="button"
        id={buttonId}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="landing-faq-trigger"
      >
        <span className="landing-faq-question">{item.q}</span>
        <span className="landing-faq-icon" aria-hidden>
          +
        </span>
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        hidden={!open}
        className="landing-faq-panel"
      >
        <p>{item.a}</p>
      </div>
    </div>
  );
}

export function TerminalLandingFaq() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="border-t border-outline-variant bg-background">
      <div className="landing-inner py-16 lg:py-20">
        <h2 className="mb-8 text-2xl font-bold tracking-tight text-on-surface sm:text-3xl">FAQ</h2>

        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2.5">
          {FAQS.map((item, index) => (
            <FaqRow
              key={item.q}
              item={item}
              open={openIndex === index}
              onToggle={() => setOpenIndex((current) => (current === index ? null : index))}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
