"use client";

import Link from "next/link";
import * as React from "react";

import { FOCUS } from "@/components/ask/atoms";
import { StockLogo } from "@/components/stock-logo";
import { isAskCard, type AskCard, type AskUIMessage } from "@/lib/ask-cards";
import { contextHref, contextLabel, contextPin, type AskContext } from "@/lib/ask-context";

/**
 * The item a conversation started from, pinned at its top: what it is, one
 * line about it and a link back to it. The words come from the lookup the
 * server ran for the first question (its tool call id starts with "ctx-",
 * lib/ask-context-open.ts), so opening the page reads nothing and nothing is
 * written for the pin.
 */

/**
 * The card the server opened for this conversation's item, once the first answer has it. "missing" when the first
 * answer has moved on without one (the item is gone, or only an account can open it); null while there is no answer.
 */
export function openedCard(messages: AskUIMessage[]): AskCard | "missing" | null {
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    let started = false;
    for (const part of message.parts) {
      const tool = part as { type: string; toolCallId?: string; state?: string; output?: unknown };
      if (tool.type.startsWith("tool-") && tool.toolCallId?.startsWith("ctx-")) {
        if (tool.state !== "output-available") return null;
        return isAskCard(tool.output) && tool.output.card !== "error" ? tool.output : "missing";
      }
      // The server writes the opened item before any other lookup or any words, so either of these means there is none.
      if (tool.type === "text" || tool.type.startsWith("tool-")) started = true;
    }
    // Only the first answer can hold it: the item is opened with the first question.
    return started ? "missing" : null;
  }
  return null;
}

export function ContextPin({
  context,
  messages,
  onDismiss,
  dismissLabel,
}: {
  context: AskContext;
  messages: AskUIMessage[];
  onDismiss: () => void;
  /** "Ask without it" before the first question; "Hide this" once the conversation has started. */
  dismissLabel: string;
}) {
  const opened = React.useMemo(() => openedCard(messages), [messages]);
  const pin = contextPin(context, opened === "missing" ? null : opened);
  // A report that could not be opened (deleted, or someone else's) is not linked to; its stock is.
  const back =
    opened === "missing" && context.kind === "research" && context.ticker
      ? contextHref({ ...context, kind: "stock", id: null })
      : opened && opened !== "missing" && opened.card === "quote" && context.kind === "brief"
        ? contextHref({ ...context, kind: "stock", id: null, day: null })
        : contextHref(context);
  return (
    <div className="min-w-0 rounded-xl border border-oa-border bg-oa-card px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        {pin.ticker ? <StockLogo ticker={pin.ticker} size={20} eager /> : null}
        <p className="flex min-w-0 flex-1 items-baseline gap-2 text-[14px] leading-5">
          {pin.ticker ? <span className="oa-mono shrink-0 font-medium text-oa-fg">{pin.ticker}</span> : null}
          {pin.title && pin.title !== pin.ticker ? (
            <span title={pin.title} className={`min-w-0 truncate ${pin.ticker ? "text-oa-muted-fg" : "font-medium text-oa-fg"}`}>
              {pin.title}
            </span>
          ) : null}
        </p>
        <Link
          prefetch={false}
          href={back.href}
          className={`shrink-0 whitespace-nowrap text-[13px] font-medium text-oa-fg underline decoration-oa-border underline-offset-2 hover:decoration-current ${FOCUS}`}
        >
          {back.label}
        </Link>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
          title={dismissLabel}
          className={`-mr-1.5 flex size-7 shrink-0 items-center justify-center rounded-md text-oa-muted-fg hover:bg-oa-accent hover:text-oa-fg ${FOCUS}`}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M2 2l6 6M8 2 2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <p className="mt-0.5 text-pretty text-[13px] leading-[18px] text-oa-muted-fg">
        {pin.summary ?? (
          <>
            The answer starts from <span className="text-oa-fg">{contextLabel(context)}</span>.
          </>
        )}
      </p>
    </div>
  );
}
