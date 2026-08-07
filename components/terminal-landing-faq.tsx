"use client";

import { useId, useState } from "react";

type FaqItem = { q: string; a: string };

const FAQS: FaqItem[] = [
  {
    q: "What do I get for free?",
    a: "Search any US stock and track up to three names in your Watchlist. Pro adds detailed calls, price zones, targets, unlimited tracking and alerts.",
  },
  {
    q: "Free or Pro: which should I pick?",
    a: "Start free with up to three stocks. Choose Pro when you want unlimited tracking, the full research and alerts.",
  },
  {
    q: "What does Pro actually add?",
    a: "Detailed calls, price zones and targets, unlimited Watchlist stocks, alerts, and access from compatible AI agents.",
  },
  {
    q: "Can I use Stocksbrew in Claude Code, Cursor, or Codex?",
    a: "Yes. Pro includes MCP and REST access for current stock research, your Watchlist, changes and alerts. You choose narrow read and write scopes. Stocksbrew cannot place trades or move money.",
  },
  {
    q: "Is there a free trial?",
    a: "Yes. Monthly and yearly both include 3 days of full Pro access. Cancel anytime before the trial ends.",
  },
  {
    q: "Is this investment advice?",
    a: "No. Stocksbrew provides research for your own decisions. It is not a broker and cannot place trades or move money.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. One click, no questions asked, and you keep access until the period you paid for runs out.",
  },
  {
    q: "Which markets do you cover?",
    a: "US-listed stocks. Each page shows when its price, financials and research were last updated.",
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
        <h2 className="mb-8 text-[26px] font-semibold tracking-tight text-on-surface sm:text-[32px]">FAQ</h2>

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
