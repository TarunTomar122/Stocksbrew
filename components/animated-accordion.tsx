"use client";

import { useState } from "react";

/**
 * Accordion with the transitions.dev grid-rows reveal. Keeps native button
 * semantics (aria-expanded + region) while animating height and chevron.
 */
export function AnimatedAccordion({
  items,
}: {
  items: Array<{ id: string; question: string; answer: string }>;
}) {
  const [openId, setOpenId] = useState<string | null>(items[0]?.id ?? null);

  return (
    <div>
      {items.map((item, index) => {
        const open = openId === item.id;
        return (
          <div
            key={item.id}
            className="t-acc border-b border-oa-border last:border-b-0"
            data-open={open ? "true" : "false"}
          >
            <button
              type="button"
              id={`acc-trigger-${item.id}`}
              aria-expanded={open}
              aria-controls={`acc-panel-${item.id}`}
              onClick={() => setOpenId(open ? null : item.id)}
              className="group flex w-full cursor-pointer list-none items-center justify-between gap-4 py-5 text-left"
            >
              <span className="flex items-baseline gap-3 text-[18px] font-medium leading-snug text-oa-fg">
                <span className="oa-mono tabular-nums text-base text-oa-muted-fg">
                  {String(index + 1).padStart(2, "0")}
                </span>
                {item.question}
              </span>
              <span
                aria-hidden
                className="t-acc-chevron shrink-0 text-lg text-oa-muted-fg transition-colors group-hover:text-oa-fg"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M3.5 6 8 10.5 12.5 6"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </button>
            <div id={`acc-panel-${item.id}`} className="t-acc-panel" role="region" aria-labelledby={`acc-trigger-${item.id}`}>
              <div className="t-acc-panel-inner">
                <p className="max-w-3xl pb-6 pr-8 text-[17px] leading-8 text-oa-muted-fg">{item.answer}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
