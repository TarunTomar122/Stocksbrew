"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  AssistantResizeHandle,
  readStoredAssistantWidth,
} from "@/components/assistant-resize-handle";
import { RadarChat } from "@/components/radar-chat";
import { RadarChatProvider } from "@/components/radar-chat-context";

export type RadarChatStarter = {
  label: string;
  message: string;
};

const CHAT_OPEN_STORAGE_KEY = "tikrr-radar-chat-open";

type RadarWorkspaceProps = {
  children: ReactNode;
  trackedCount: number;
  tickers: string[];
  starters: RadarChatStarter[];
};

export function RadarWorkspace({
  children,
  trackedCount,
  tickers,
  starters,
}: RadarWorkspaceProps) {
  const [mobileTab, setMobileTab] = useState<"radar" | "chat">("radar");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatWidth, setChatWidth] = useState(readStoredAssistantWidth);
  const [hydrated, setHydrated] = useState(false);
  const radarScrollRef = useRef<HTMLDivElement>(null);
  const preservedDocScrollRef = useRef(0);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(CHAT_OPEN_STORAGE_KEY);
      if (stored === "true") setChatOpen(true);
    } catch {
      // ignore
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(CHAT_OPEN_STORAGE_KEY, String(chatOpen));
    } catch {
      // ignore
    }
  }, [chatOpen, hydrated]);

  useLayoutEffect(() => {
    if (!chatOpen) return;
    const pane = radarScrollRef.current;
    const mainEl = pane?.closest("main");
    if (!pane || !mainEl) return;
    /** Map document scroll (while radar was inline) onto the inner radar scroller after we go fixed-layout. */
    const docMainTop = window.scrollY + mainEl.getBoundingClientRect().top;
    pane.scrollTop = Math.max(0, preservedDocScrollRef.current - docMainTop);
    window.scrollTo({ top: Math.max(0, docMainTop) });
  }, [chatOpen]);

  useEffect(() => {
    if (!chatOpen) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [chatOpen]);

  const openChat = useCallback(() => {
    preservedDocScrollRef.current = window.scrollY;
    setChatOpen(true);
    setMobileTab("chat");
  }, []);

  const closeChat = useCallback(() => {
    setChatOpen(false);
    setMobileTab("radar");
  }, []);

  const contentWrapperClass = chatOpen
    ? "flex flex-col gap-12 px-4 py-6 sm:px-6 lg:px-10 lg:py-8"
    : "mx-auto flex w-full max-w-[1440px] flex-col gap-8 px-4 py-6 sm:px-6 md:px-8 lg:px-10 lg:py-8";

  const showRadarPane = !chatOpen || mobileTab === "radar";
  const showMobileChat = chatOpen && mobileTab === "chat";

  return (
    <RadarChatProvider openChat={openChat} closeChat={closeChat}>
      {/*
        Preserve layout height so the footer does not collapse when the shell is position:fixed,
        while keeping the Radar + Assistant UI anchored to the viewport (not midway down the page).
      */}
      {chatOpen ? (
        <div className="h-[calc(100dvh-4rem)] shrink-0" aria-hidden />
      ) : null}
      <div
        className={
          chatOpen
            ? "fixed inset-x-0 bottom-0 top-16 z-20 flex min-h-0 flex-col overflow-hidden bg-surface"
            : "relative w-full"
        }
      >
        {chatOpen && (
          <div className="flex shrink-0 border-b border-outline-variant lg:hidden">
            <button
              type="button"
              onClick={() => setMobileTab("radar")}
              className={`flex-1 px-4 py-3 text-[13px] font-semibold transition-colors ${
                mobileTab === "radar"
                  ? "border-b-2 border-on-surface text-on-surface"
                  : "text-on-surface-variant"
              }`}
            >
              Watchlist
            </button>
            <button
              type="button"
              onClick={() => openChat()}
              className={`flex-1 px-4 py-3 text-[13px] font-semibold transition-colors ${
                mobileTab === "chat"
                  ? "border-b-2 border-on-surface text-on-surface"
                  : "text-on-surface-variant"
              }`}
            >
              Assistant
            </button>
          </div>
        )}

        <div className={`flex min-h-0 flex-1 overflow-hidden ${chatOpen ? "" : "w-full"}`}>
          <div
            ref={radarScrollRef}
            className={`min-h-0 min-w-0 flex-1 overflow-y-auto ${
              showRadarPane ? "block" : "hidden"
            } ${chatOpen ? "lg:block" : ""}`}
            style={chatOpen ? { paddingRight: chatWidth } : undefined}
          >
            <div className={contentWrapperClass}>{children}</div>
          </div>

          {showMobileChat && (
            <aside className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-surface lg:hidden">
              <RadarChat trackedCount={trackedCount} tickers={tickers} starters={starters} />
            </aside>
          )}
        </div>
      </div>

      {chatOpen && (
        <aside
          className="fixed bottom-0 top-16 z-30 hidden flex-col overflow-hidden border-l border-outline-variant bg-surface lg:flex"
          style={{ width: chatWidth, right: 0 }}
        >
          <AssistantResizeHandle width={chatWidth} onWidthChange={setChatWidth} />
          <RadarChat trackedCount={trackedCount} tickers={tickers} starters={starters} />
        </aside>
      )}

    </RadarChatProvider>
  );
}
