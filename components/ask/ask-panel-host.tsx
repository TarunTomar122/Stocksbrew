"use client";

import dynamic from "next/dynamic";
import * as React from "react";

import type { AskRequest } from "@/components/ask/ask-workspace";
import { takeAskReopen } from "@/lib/ask-handoff";
import { ASK_PANEL_ID, askLinkTarget } from "@/lib/ask-link";
import { usePublicPathname } from "@/lib/use-public-pathname";

/**
 * The Ask panel's always-there part: the chrome's Ask button, and the click
 * catcher that turns any link to /ask?q=... (lib/next-steps.ts askHref) or an
 * Ask box (<form action="/ask">) into the panel instead of a page change.
 * Middle-click, cmd/ctrl/shift-click and links with a target still open /ask.
 *
 * Everything else (the conversation, the cards, the model client) is in
 * ./ask-panel.tsx, loaded the first time the panel opens, so pages carry only
 * this file. Nothing here runs on the server: the cached signed-out pages stay
 * the same static HTML.
 */

const AskPanel = dynamic(() => import("@/components/ask/ask-panel"), {
  ssr: false,
  // The chunk is small to fetch but not instant on a phone: hold the place so the click visibly did something.
  loading: () => (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-[55] flex h-[88dvh] items-center justify-center rounded-t-2xl border border-oa-border bg-oa-page text-[14px] text-oa-muted-fg shadow-[0_-12px_40px_-16px_rgba(0,0,0,0.3)] lg:inset-x-auto lg:right-0 lg:top-0 lg:z-[45] lg:h-dvh lg:w-[420px] lg:rounded-none"
    >
      Opening Ask…
    </div>
  ),
});

/** Warm the panel's chunk on intent (hover, focus), so the click opens it at once. */
const preload = () => void import("@/components/ask/ask-panel");

const OPEN_EVENT = "stocksbrew:ask-open";

// Whether the panel is open, for the Ask buttons' aria-expanded. The host is the only writer.
let panelOpen = false;
const watchers = new Set<() => void>();
function setPanelOpen(value: boolean) {
  if (panelOpen === value) return;
  panelOpen = value;
  watchers.forEach((notify) => notify());
}
function watchPanel(notify: () => void) {
  watchers.add(notify);
  return () => void watchers.delete(notify);
}
type OpenDetail = { question: string | null; context: string | null; opener: HTMLElement | null };

/** Open the panel from anywhere in the app. Null question: just open (or bring back) the conversation. */
export function openAskPanel(detail: Partial<OpenDetail> = {}): void {
  window.dispatchEvent(new CustomEvent<OpenDetail>(OPEN_EVENT, { detail: { question: null, context: null, opener: null, ...detail } }));
}

export function AskPanelHost() {
  const pathname = usePublicPathname() ?? "/";
  const [mounted, setMounted] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [request, setRequest] = React.useState<AskRequest | null>(null);
  const opener = React.useRef<HTMLElement | null>(null);
  /** The last question handed over, so a double click or a second tap does not ask it twice. */
  const lastAsked = React.useRef<{ key: string; at: number } | null>(null);
  const onAskPage = pathname === "/ask";
  const onAskPageRef = React.useRef(onAskPage);
  onAskPageRef.current = onAskPage;

  const show = React.useCallback((detail: OpenDetail) => {
    if (detail.question) {
      const key = `${detail.question.trim()}\n${detail.context ?? ""}`;
      const now = Date.now();
      if (lastAsked.current && lastAsked.current.key === key && now - lastAsked.current.at < 1500) return;
      lastAsked.current = { key, at: now };
    }
    opener.current = detail.opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setRequest({ question: detail.question, context: detail.context, nonce: Date.now() + Math.random() });
    setMounted(true);
    setOpen(true);
  }, []);

  React.useEffect(() => {
    const onOpen = (event: Event) => show((event as CustomEvent<OpenDetail>).detail);
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (onAskPageRef.current) return;
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement) || (link.target && link.target !== "_self") || link.hasAttribute("download")) return;
      const target = askLinkTarget(new URL(link.href, window.location.href), window.location.origin);
      if (!target) return;
      // Capture phase, before Next's <Link> handler: it skips a click that is already handled.
      event.preventDefault();
      show({ ...target, opener: link });
      // The top loading bar (nextjs-toploader in app/providers.tsx) starts on any same-site link click and stops at
      // the next history write. Nothing navigates here, so write the same entry back once its handler has run.
      window.setTimeout(() => window.history.replaceState(window.history.state, "", window.location.href), 0);
    };
    const onSubmit = (event: SubmitEvent) => {
      const form = event.target;
      if (event.defaultPrevented || onAskPageRef.current || !(form instanceof HTMLFormElement)) return;
      if (form.getAttribute("action") !== "/ask" || (form.method || "get").toLowerCase() !== "get") return;
      const data = new FormData(form);
      const question = String(data.get("q") ?? "").trim();
      if (!question) return;
      event.preventDefault();
      const context = String(data.get("ctx") ?? "").trim() || null;
      const box = form.querySelector<HTMLInputElement | HTMLTextAreaElement>('[name="q"]');
      if (box) box.value = "";
      show({ question, context, opener: box ?? form });
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    window.addEventListener("click", onClick, true);
    window.addEventListener("submit", onSubmit, true);

    // ?ask=1 (or ?ask=<question>) opens the panel on arrival, with &askctx= for the item; a sign-in reload
    // reopens it with the question that was waiting.
    const params = new URLSearchParams(window.location.search);
    const asked = params.get("ask");
    if (asked !== null && !onAskPageRef.current) {
      const question = asked === "1" || asked === "" ? null : asked;
      show({ question, context: params.get("askctx"), opener: null });
      params.delete("ask");
      params.delete("askctx");
      const rest = params.toString();
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`);
    } else {
      const reopen = takeAskReopen();
      if (reopen && !onAskPageRef.current) show({ ...reopen, opener: null });
    }
    return () => {
      window.removeEventListener(OPEN_EVENT, onOpen);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("submit", onSubmit, true);
    };
  }, [show]);

  // On /ask the page is the conversation: the panel steps aside (and keeps what it had for the next page).
  React.useEffect(() => {
    if (onAskPage) setOpen(false);
  }, [onAskPage]);
  React.useEffect(() => setPanelOpen(open && !onAskPage), [open, onAskPage]);

  const close = React.useCallback(() => {
    setOpen(false);
    const back = opener.current;
    opener.current = null;
    // Back to whatever opened it, if it is still on the page; otherwise the Ask button in the chrome.
    const fallback = Array.from(document.querySelectorAll<HTMLElement>("[data-ask-opener]")).find((button) => button.offsetParent !== null);
    // Never something inside the panel that just closed (a link in an answer can open it again).
    const usable = back && back.isConnected && !back.closest(`#${ASK_PANEL_ID}`) ? back : fallback;
    window.requestAnimationFrame(() => usable?.focus());
  }, []);

  // After "Open full screen" the conversation lives on /ask; the panel starts fresh next time.
  const handedOff = React.useCallback(() => {
    setOpen(false);
    setMounted(false);
    setRequest(null);
    opener.current = null;
  }, []);

  if (!mounted) return null;
  return <AskPanel open={open && !onAskPage} request={request} onClose={close} onHandedOff={handedOff} />;
}

/**
 * The chrome's Ask button: a row under search in the sidebar, a small pill in the phone's top bar. On /ask it moves
 * the cursor to the page's own box instead.
 */
export function AskPanelButton({ variant }: { variant: "row" | "pill" }) {
  const pathname = usePublicPathname();
  const expanded = React.useSyncExternalStore(watchPanel, () => panelOpen, () => false);
  const onClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (pathname === "/ask") {
      document.getElementById("ask-input")?.focus();
      return;
    }
    // On the agent thread the reply box is Ask: one Ask per page (owner rule 1).
    const reply = pathname === "/agent" ? document.getElementById("thread-input") : null;
    if (reply) {
      reply.focus();
      return;
    }
    openAskPanel({ opener: event.currentTarget });
  };
  const icon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-4 shrink-0">
      <path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-6l-4.5 3.5V17H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
      <path d="M8 10h8M8 13h5" />
    </svg>
  );
  if (variant === "row") {
    return (
      <button
        type="button"
        data-ask-opener=""
        onClick={onClick}
        onMouseEnter={preload}
        onFocus={preload}
        aria-haspopup="dialog"
        aria-expanded={expanded}
        aria-controls={expanded ? ASK_PANEL_ID : undefined}
        className="mt-1.5 flex h-9 w-full items-center gap-2.5 rounded-lg border border-oa-border bg-oa-card px-3 text-left text-[14px] text-oa-muted-fg outline-none transition-colors hover:text-oa-fg focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]"
      >
        {icon}
        <span className="flex-1 truncate">Ask a question</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      data-ask-opener=""
      onClick={onClick}
      onTouchStart={preload}
      onFocus={preload}
      aria-haspopup="dialog"
      aria-expanded={expanded}
      aria-controls={expanded ? ASK_PANEL_ID : undefined}
      aria-label="Ask a question"
      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-oa-border bg-oa-card px-3 text-[14px] font-medium text-oa-fg outline-none transition-colors hover:bg-oa-accent focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]"
    >
      {icon}
      Ask
    </button>
  );
}
