"use client";

import { AnimatedIcon } from "@/components/animated-icon";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  getToolName,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithToolCalls,
  type UIMessage,
} from "ai";
import { useEffect, useRef, useState } from "react";
import { ChatMarkdown } from "@/components/chat-markdown";
import { useRadarChat } from "@/components/radar-chat-context";
import type { RadarChatStarter } from "@/components/radar-workspace";

function messageText(parts: UIMessage["parts"]): string {
  return parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function renderToolStatus(part: UIMessage["parts"][number], index: number) {
  if (!isToolUIPart(part)) return null;
  const toolName = getToolName(part);
  if (part.state === "output-error") {
    return (
      <span key={index} className="text-[12px] text-[#f59e0b]">
        {toolName === "web_search" ? "Search failed — using radar data" : "Intel lookup failed"}
      </span>
    );
  }
  const running = part.state === "input-streaming" || part.state === "input-available";
  if (!running) return null;
  const label = toolName === "web_search" ? "Searching the web…" : "Pulling stock intel…";
  return (
    <span key={index} className="italic text-on-surface-variant text-[12px]">
      {label}
    </span>
  );
}

function lastAssistantMessage(messages: UIMessage[]) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "assistant") return messages[i];
  }
  return null;
}

type RadarChatProps = {
  trackedCount: number;
  tickers: string[];
  starters: RadarChatStarter[];
};

export function RadarChat({ trackedCount, tickers, starters }: RadarChatProps) {
  const [input, setInput] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { pendingPrompt, consumePendingPrompt, registerFocusChat, closeChat } = useRadarChat();

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onError: (err) => {
      setChatError(err.message || "Something went wrong. Try again.");
    },
  });

  const isBusy = status === "submitted" || status === "streaming";
  const lastAssistant = lastAssistantMessage(messages);
  const lastAssistantHasText = Boolean(lastAssistant && messageText(lastAssistant.parts));
  const showThinking = isBusy && !lastAssistantHasText;

  useEffect(() => {
    registerFocusChat(() => {
      inputRef.current?.focus();
    });
  }, [registerFocusChat]);

  useEffect(() => {
    if (!pendingPrompt) return;
    setInput(pendingPrompt);
    consumePendingPrompt();
    inputRef.current?.focus();
  }, [pendingPrompt, consumePendingPrompt]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isBusy]);

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || status !== "ready") return;
    setChatError(null);
    sendMessage({ text: trimmed });
    setInput("");
  };

  const tickerLabel =
    tickers.length > 0 ? tickers.slice(0, 6).join(", ") + (tickers.length > 6 ? "…" : "") : "none";

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-outline-variant px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-[14px] font-semibold text-on-surface">Assistant</h2>
              <span className="rounded-md tint-warn px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-[#f59e0b]">
                Beta
              </span>
            </div>
            <p className="mt-0.5 truncate text-[12px] text-on-surface-variant">
              {trackedCount > 0
                ? `${trackedCount} tickers · ${tickerLabel}`
                : "Add tickers to your radar"}
            </p>
          </div>
          <button
            type="button"
            onClick={closeChat}
            aria-label="Close assistant"
            className="shrink-0 rounded-md p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
          >
            <AnimatedIcon name="close" size={20} />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex flex-col gap-4">
            <p className="text-[13px] leading-relaxed text-on-surface-variant">
              Ask about your holdings, directives, or breaking news.
            </p>
            {starters.length > 0 && (
              <div className="flex flex-col gap-2">
                {starters.map((starter) => (
                  <button
                    key={starter.label}
                    type="button"
                    disabled={status !== "ready"}
                    onClick={() => submit(starter.message)}
                    className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2.5 text-left text-[13px] text-on-surface transition-colors hover:border-on-surface hover:bg-surface disabled:opacity-50"
                  >
                    {starter.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[92%] rounded-lg px-3.5 py-2.5 ${
                    m.role === "user"
                      ? "bg-on-surface text-surface"
                      : "bg-surface-container text-on-surface"
                  }`}
                >
                  <div className="flex flex-col gap-1.5">
                    {m.parts.map((part, index) => renderToolStatus(part, index))}
                    {messageText(m.parts) ? (
                      m.role === "assistant" ? (
                        <ChatMarkdown content={messageText(m.parts)} />
                      ) : (
                        <p className="text-[14px] leading-snug text-white">{messageText(m.parts)}</p>
                      )
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
            {showThinking && (
              <div className="flex items-start">
                <div className="rounded-lg bg-surface-container px-3.5 py-2 text-[13px] text-on-surface-variant">
                  <span className="animate-pulse">Thinking…</span>
                </div>
              </div>
            )}
            {chatError && (
              <div className="rounded-lg border border-outline-variant tint-bear px-3.5 py-2 text-[13px] text-[#ef4444]">
                {chatError}
              </div>
            )}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
        className="shrink-0 border-t border-outline-variant bg-surface px-4 py-3"
      >
        <div className="flex items-end gap-2 rounded-xl border border-outline-variant bg-surface-container-low p-2 transition-colors focus-within:border-on-surface focus-within:bg-surface">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(input);
              }
            }}
            rows={1}
            placeholder="Ask about your radar…"
            disabled={status !== "ready"}
            className="max-h-28 min-h-[36px] flex-1 resize-none border-0 bg-transparent px-2 py-1.5 text-[14px] leading-snug text-on-surface placeholder:text-[#a1a1aa] focus:outline-none focus:ring-0 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={status !== "ready" || !input.trim()}
            aria-label="Send message"
            className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-on-surface text-surface transition-colors hover:bg-[#242424] disabled:bg-surface-container-high disabled:text-on-surface-variant disabled:hover:bg-surface-container-high"
          >
            <AnimatedIcon name="arrow_upward" size={20} />
          </button>
        </div>
      </form>
    </div>
  );
}
