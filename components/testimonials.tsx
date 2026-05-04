"use client";

import { useState, useEffect, useCallback } from "react";

type Testimonial = {
  name: string;
  role: string;
  avatar: string;
  text: string;
};

const TESTIMONIALS: Testimonial[] = [
  {
    name: "Marcus Chen",
    role: "Independent trader, 6 years",
    avatar: "MC",
    text: "Finally a tool that doesn't drown me in noise. The AI briefs give me the 3 things I actually need to know before the open — saves me an hour every morning.",
  },
  {
    name: "Priya Sharma",
    role: "Equity research associate",
    avatar: "PS",
    text: "The sector flow and institutional positioning data alone is worth it. I used to stitch this together from 5 different sources. Now it's one screen.",
  },
  {
    name: "David Okonkwo",
    role: "Part-time investor, tech lead",
    avatar: "DO",
    text: "I have maybe 20 minutes a day to check the market. Tikrr condenses what would take me 2 hours of reading into a 5-minute scan. The signal-to-noise ratio is unmatched.",
  },
  {
    name: "Lauren Walsh",
    role: "Portfolio manager, small fund",
    avatar: "LW",
    text: "The Radar watchlist with personalized AI briefs changed how I manage my book. Catalyst alerts and divergence signals have caught things I would've missed on my own.",
  },
  {
    name: "Raj Mehta",
    role: "Retail investor, 12 years",
    avatar: "RM",
    text: "I've tried every screener and dashboard out there. Tikrr is the first one where I actually trust the scores. The four-pillar framework makes sense and the briefs are genuinely useful.",
  },
  {
    name: "Emma Johansson",
    role: "Day trader turned swing trader",
    avatar: "EJ",
    text: "The heat list found me a breakout before it showed up anywhere else. That one trade paid for my subscription for the year. The essentials cards are my new morning ritual.",
  },
];

const AVATAR_COLORS = [
  "bg-[#6366f1] text-white",
  "bg-[#10b981] text-white",
  "bg-[#f59e0b] text-[#111111]",
  "bg-[#ef4444] text-white",
  "bg-[#8b5cf6] text-white",
  "bg-[#ec4899] text-white",
];

export function Testimonials() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  const advance = useCallback(() => {
    setActive((i) => (i + 1) % TESTIMONIALS.length);
  }, []);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(advance, 5000);
    return () => clearInterval(t);
  }, [advance, paused]);

  const dots = TESTIMONIALS.map((_, i) => i);
  const t = TESTIMONIALS[active];

  return (
    <section
      className="flex flex-col gap-6"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#6b7280]">
          Testimonials
        </span>
        <h2 className="text-[24px] md:text-[28px] font-semibold tracking-[-0.03em] text-[#111111]">
          Loved by traders and investors
        </h2>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white">
        <div
          className="flex transition-transform duration-500 ease-apple-ease"
          style={{ transform: `translateX(-${active * 100}%)` }}
        >
          {TESTIMONIALS.map((item, idx) => (
            <div
              key={idx}
              className="w-full shrink-0 px-8 py-10 md:px-12 md:py-12 flex flex-col items-center text-center gap-5"
            >
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-full text-[16px] font-bold ${AVATAR_COLORS[idx % AVATAR_COLORS.length]}`}
              >
                {item.avatar}
              </div>
              <blockquote className="text-[16px] md:text-[18px] text-[#374151] leading-[1.65] max-w-[600px]">
                &ldquo;{item.text}&rdquo;
              </blockquote>
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-[14px] font-semibold text-[#111111]">{item.name}</span>
                <span className="text-[12px] text-[#6b7280]">{item.role}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-center gap-2 pb-6">
          <button
            type="button"
            onClick={() => setActive((i) => (i - 1 + TESTIMONIALS.length) % TESTIMONIALS.length)}
            className="flex items-center justify-center h-8 w-8 rounded-full border border-[#e5e7eb] bg-white text-[#6b7280] hover:border-[#111111] hover:text-[#111111] transition-colors"
            aria-label="Previous testimonial"
          >
            <span className="material-symbols-outlined text-[16px]">chevron_left</span>
          </button>
          <div className="flex items-center gap-1.5">
            {dots.map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActive(i)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === active ? "w-6 bg-[#111111]" : "w-1.5 bg-[#d1d5db] hover:bg-[#9ca3af]"
                }`}
                aria-label={`Go to testimonial ${i + 1}`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={advance}
            className="flex items-center justify-center h-8 w-8 rounded-full border border-[#e5e7eb] bg-white text-[#6b7280] hover:border-[#111111] hover:text-[#111111] transition-colors"
            aria-label="Next testimonial"
          >
            <span className="material-symbols-outlined text-[16px]">chevron_right</span>
          </button>
        </div>
      </div>
    </section>
  );
}
