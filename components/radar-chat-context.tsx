"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type RadarChatContextValue = {
  askAbout: (ticker: string) => void;
  openChat: () => void;
  closeChat: () => void;
  pendingPrompt: string | null;
  consumePendingPrompt: () => void;
  focusChat: () => void;
  registerFocusChat: (fn: () => void) => void;
};

const RadarChatContext = createContext<RadarChatContextValue | null>(null);

type RadarChatProviderProps = {
  children: ReactNode;
  openChat: () => void;
  closeChat: () => void;
};

export function RadarChatProvider({ children, openChat, closeChat }: RadarChatProviderProps) {
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [focusChatFn, setFocusChatFn] = useState<(() => void) | null>(null);

  const registerFocusChat = useCallback((fn: () => void) => {
    setFocusChatFn(() => fn);
  }, []);

  const focusChat = useCallback(() => {
    focusChatFn?.();
  }, [focusChatFn]);

  const askAbout = useCallback(
    (ticker: string) => {
      const symbol = ticker.trim().toUpperCase();
      if (!symbol) return;
      openChat();
      setPendingPrompt(`What's the latest on ${symbol}?`);
      focusChatFn?.();
    },
    [openChat, focusChatFn],
  );

  const consumePendingPrompt = useCallback(() => {
    setPendingPrompt(null);
  }, []);

  const value = useMemo(
    () => ({
      askAbout,
      openChat,
      closeChat,
      pendingPrompt,
      consumePendingPrompt,
      focusChat,
      registerFocusChat,
    }),
    [askAbout, openChat, closeChat, pendingPrompt, consumePendingPrompt, focusChat, registerFocusChat],
  );

  return <RadarChatContext.Provider value={value}>{children}</RadarChatContext.Provider>;
}

export function useRadarChat() {
  const ctx = useContext(RadarChatContext);
  if (!ctx) {
    throw new Error("useRadarChat must be used within RadarChatProvider");
  }
  return ctx;
}
