"use client";

import * as React from "react";

import { FOCUS } from "@/components/ask/atoms";
import { OaButton } from "@/components/oa/button";
import { ASK_MAX_QUESTION_CHARS } from "@/lib/ask-config";

/** The Ask box on the Explore desk. Submitting hands the question to /ask, which answers it. */
export function AskBox({ suggestions }: { suggestions: string[] }) {
  const [value, setValue] = React.useState("");
  const [leaving, setLeaving] = React.useState(false);

  const go = (question: string) => {
    const text = question.trim().slice(0, ASK_MAX_QUESTION_CHARS);
    if (!text || leaving) return;
    setLeaving(true);
    window.location.assign(`/ask?q=${encodeURIComponent(text)}`);
  };

  return (
    <div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          go(value);
        }}
        className="oa-surface flex items-end gap-2 border border-oa-border bg-oa-bg p-1.5 pl-3 focus-within:border-[color-mix(in_srgb,var(--oa-ring)_70%,transparent)]"
      >
        <label htmlFor="explore-ask" className="sr-only">
          Ask the copilot
        </label>
        <textarea
          id="explore-ask"
          value={value}
          rows={1}
          maxLength={ASK_MAX_QUESTION_CHARS}
          onChange={(event) => {
            setValue(event.target.value);
            event.target.style.height = "auto";
            event.target.style.height = `${Math.min(event.target.scrollHeight, 144)}px`;
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              go(value);
            }
          }}
          placeholder="Ask about a stock or an idea"
          className="max-h-36 min-h-[36px] flex-1 resize-none bg-transparent py-1.5 text-[16px] leading-6 text-oa-fg outline-none placeholder:text-oa-muted-fg"
        />
        <OaButton type="submit" size="md" loading={leaving}>
          Ask
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M7 11.5v-9M3.2 6.2 7 2.4l3.8 3.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </OaButton>
      </form>
      <ul className="mt-2 flex flex-col">
        {suggestions.map((suggestion) => (
          <li key={suggestion}>
            <button
              type="button"
              onClick={() => go(suggestion)}
              className={`flex min-h-10 w-full items-center rounded text-left text-[14px] leading-5 text-oa-muted-fg hover:text-oa-fg sm:min-h-8 ${FOCUS}`}
            >
              {suggestion}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
