"use client";

import { AnimatedIcon } from "@/components/animated-icon";

import { useState, useEffect, useCallback } from "react";

type Testimonial = {
  name: string;
  role: string;
  avatar: string;
  text: string;
};

const TESTIMONIALS: Testimonial[] = [
  {
    name: "Mohit Kumar",
    role: "Independent trader, 6 years",
    avatar: "MC",
    text: "I used to spend way too much time going through news every morning. This just gives me what actually matters before the open. Easily saves me an hour.",
  },
  {
    name: "Priya Sharma",
    role: "Equity research associate",
    avatar: "PS",
    text: "The sector flow and positioning data is really solid. I used to pull this from multiple places and it was a pain. Now it is just there in one view.",
  },
  {
    name: "Abhay Pandey",
    role: "Part-time investor, tech lead",
    avatar: "DO",
    text: "I barely get 20 minutes a day to look at markets. This makes it easy to catch up fast without feeling lost. It cuts through a lot of noise.",
  },
  {
    name: "Harsh",
    role: "Portfolio manager, small fund",
    avatar: "LW",
    text: "The watchlist and alerts have been surprisingly useful. I have caught a few moves early that I probably would have missed otherwise.",
  },
  {
    name: "Raj Mehta",
    role: "Retail investor, 12 years",
    avatar: "RM",
    text: "I have tried a lot of tools over the years and most of them feel gimmicky. This one actually feels reliable. The scoring system is simple and makes sense.",
  },
  {
    name: "Rajesh Singh",
    role: "Day trader turned swing trader",
    avatar: "EJ",
    text: "Found a setup through the heat list that I would not have seen elsewhere. That trade alone made this worth it for me. I check it every morning now.",
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
    const t = setInterval(advance, 4000);
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
      <div className="flex flex-col gap-1.5 text-center pt-8">
        <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#6b7280]">
          Testimonials
        </span>
        <h2 className="text-[24px] md:text-[28px] font-semibold tracking-[-0.03em] text-[#111111]">
          Loved by traders and investors
        </h2>
      </div>

      <div className="relative overflow-hidden bg-white">
        <div
          className="flex transition-transform duration-500 ease-apple-ease"
          style={{ transform: `translateX(-${active * 100}%)` }}
        >
          {TESTIMONIALS.map((item, idx) => (
            <div
              key={idx}
              className="w-full shrink-0 px-8 py-10 md:px-12 md:py-12 flex flex-col items-center text-center gap-5"
            >
              <blockquote className="text-[16px] md:text-[18px] text-[#374151] leading-[1.65] max-w-[600px]">
                &ldquo;{item.text}&rdquo;
              </blockquote>
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
            <AnimatedIcon name="chevron_left" size={16} className="text-[16px]" />
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
            <AnimatedIcon name="chevron_right" size={16} className="text-[16px]" />
          </button>
        </div>
      </div>
    </section>
  );
}
