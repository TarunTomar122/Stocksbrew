"use client";

import * as React from "react";

import { FOCUS } from "@/components/ask/atoms";
import { AskWorkspace, type Allowance, type AskRequest, type PanelBarActions } from "@/components/ask/ask-workspace";
import type { AskPlan } from "@/lib/ask-config";
import { formatExampleSubject, pageExampleSubject } from "@/lib/ask-examples";
import { ASK_PANEL_ID } from "@/lib/ask-link";
import { pageAskContext } from "@/lib/ask-page-context";
import { usePublicPathname } from "@/lib/use-public-pathname";

/**
 * Ask beside the page you are on: a drawer on the right at lg and up (the page
 * stays readable and scrollable on its left), a bottom sheet on phones that
 * can grow to full height. The conversation is the same AskWorkspace as /ask
 * in its "panel" layout. Loaded only when the panel first opens
 * (./ask-panel-host.tsx), and it reads who is asking only then: one GET of
 * /api/ask, the same allowance the route enforces. Nothing calls the model
 * until a question is sent.
 */

type Viewer = { signedIn: boolean; plan: AskPlan; allowance: Allowance | null };

const DESKTOP = "(min-width: 1024px)";

function useDesktop(): boolean {
  const [desktop, setDesktop] = React.useState(() => typeof window !== "undefined" && window.matchMedia(DESKTOP).matches);
  React.useEffect(() => {
    const query = window.matchMedia(DESKTOP);
    const update = () => setDesktop(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return desktop;
}

/** The page shows the example portfolio when its own Ask links say so (lib/portfolio-home builds them with ex.). */
function pageShowsExample(): boolean {
  const marks = document.querySelectorAll('a[href^="/ask?"][href*="ctx=ex."], input[name="ctx"][value^="ex."]');
  // The panel's own links say nothing about the page under it.
  return Array.from(marks).some((mark) => !mark.closest(`#${ASK_PANEL_ID}`));
}

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function IconButton({ label, onClick, children, className = "" }: { label: string; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex size-9 shrink-0 items-center justify-center rounded-lg text-oa-muted-fg transition-colors hover:bg-oa-accent hover:text-oa-fg ${FOCUS} ${className}`}
    >
      {children}
    </button>
  );
}

function Svg({ children }: { children: React.ReactNode }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export default function AskPanel({
  open,
  request,
  onClose,
  onHandedOff,
}: {
  open: boolean;
  request: AskRequest | null;
  onClose: () => void;
  onHandedOff: () => void;
}) {
  const pathname = usePublicPathname() ?? "/";
  const desktop = useDesktop();
  const titleId = React.useId();
  const root = React.useRef<HTMLDivElement>(null);
  const [viewer, setViewer] = React.useState<Viewer | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);
  const [example, setExample] = React.useState(false);

  const loadViewer = React.useCallback(() => {
    setFailed(false);
    void fetch("/api/ask", { headers: { accept: "application/json" }, cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((data: { signed_in?: boolean; plan?: AskPlan; limit?: number | null; remaining?: number | null }) => {
        const plan: AskPlan = data.plan === "pro" || data.plan === "free" ? data.plan : "anonymous";
        const allowance = typeof data.limit === "number" && data.limit > 0 && typeof data.remaining === "number" ? { limit: data.limit, remaining: data.remaining } : null;
        setViewer({ signedIn: Boolean(data.signed_in), plan, allowance });
      })
      // A failed refresh keeps what was read before; only a first read that fails shows the retry.
      .catch(() => setFailed(true));
  }, []);
  // Read on every opening, so signing in or out elsewhere (or a new day's allowance) shows the next time.
  React.useEffect(() => {
    if (open) loadViewer();
  }, [open, loadViewer]);

  // Whether the page underneath shows the example, read once it has drawn (and again when it changes).
  React.useEffect(() => {
    setExample(pageShowsExample());
    const timer = window.setTimeout(() => setExample(pageShowsExample()), 400);
    return () => window.clearTimeout(timer);
  }, [pathname, open]);

  const pageContext = React.useMemo(
    () => (viewer ? pageAskContext({ pathname, search: typeof window === "undefined" ? "" : window.location.search, signedIn: viewer.signedIn, example }) : null),
    [pathname, viewer, example],
  );

  // Signed out, the page's example answer (lib/ask-examples.ts). It follows the page only while the panel is open, so
  // a closed panel never fetches one as someone moves between pages.
  const pageExample = React.useMemo(() => {
    if (!viewer || viewer.signedIn) return null;
    const subject = pageExampleSubject({ pathname, pageContext });
    return subject ? formatExampleSubject(subject) : null;
  }, [viewer, pathname, pageContext]);
  const [exampleSubject, setExampleSubject] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (open) setExampleSubject(pageExample);
  }, [open, pageExample]);

  // A request from a link carries its own item. The Ask button's carries none, so it takes the page's.
  const effectiveRequest = React.useMemo<AskRequest | null>(
    () => (request && !request.question && !request.context ? { ...request, context: pageContext } : request),
    // Only a new request (or the viewer arriving for the first one) re-reads the page's item.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [request, viewer === null],
  );

  // Opening: on a desktop the cursor goes to the question box. On a phone the sheet itself takes focus, so the
  // keyboard does not cover the suggestions before anyone has read them. The sheet is modal, so the page under it
  // stops scrolling.
  React.useEffect(() => {
    if (!open) return;
    const box = desktop ? root.current?.querySelector<HTMLElement>("#ask-panel-input") : null;
    (box ?? root.current)?.focus({ preventScroll: true });
    // Only on opening (and once the conversation has first drawn), not on a resize or a refreshed allowance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, viewer === null]);
  React.useEffect(() => {
    if (!open || desktop) return;
    const html = document.documentElement;
    const before = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = before;
    };
  }, [open, desktop]);

  // Phones: the system Back closes the sheet. Opening adds a history entry for the same address (Next's own state
  // kept, so its router treats it as the same page); closing any other way takes that entry back off.
  const pushed = React.useRef(false);
  /** A pending "take the entry back off". Deferred, so an effect that runs again at once (React's dev double run,
   * or a quick reopen) keeps the entry instead of popping it and closing the sheet it just opened. */
  const backTimer = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!open || desktop) return;
    const ours = () => Boolean((window.history.state as { stocksbrewAskSheet?: boolean } | null)?.stocksbrewAskSheet);
    if (backTimer.current !== null) {
      window.clearTimeout(backTimer.current);
      backTimer.current = null;
    }
    if (!ours()) window.history.pushState({ ...window.history.state, stocksbrewAskSheet: true }, "", window.location.href);
    pushed.current = true;
    const onPop = () => {
      if (!pushed.current) return;
      pushed.current = false;
      onClose();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (!pushed.current) return;
      pushed.current = false;
      backTimer.current = window.setTimeout(() => {
        backTimer.current = null;
        if (ours()) window.history.back();
      }, 0);
    };
  }, [open, desktop, onClose]);

  // On a phone the sheet covers the page, so following a link out of an answer closes it to show where it went.
  const lastPath = React.useRef(pathname);
  React.useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    if (open && !desktop) onClose();
  }, [pathname, open, desktop, onClose]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && !event.nativeEvent.isComposing) {
      event.stopPropagation();
      onClose();
      return;
    }
    // Tab and Shift+Tab go round inside the phone sheet, which is modal. The desktop drawer sits beside a page that
    // stays in use, so Tab can leave it (and Esc, or the Ask button, brings you back).
    if (event.key !== "Tab" || desktop || !root.current) return;
    const items = Array.from(root.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((item) => item.offsetParent !== null || item === document.activeElement);
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (event.shiftKey && (document.activeElement === first || document.activeElement === root.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const bar = (actions: PanelBarActions | null) => (
    <div className="flex h-12 shrink-0 items-center gap-0.5 border-b border-oa-border pl-4 pr-2">
      <h2 id={titleId} className="flex-1 text-[15px] font-semibold text-oa-fg">
        Ask
      </h2>
      {actions && !actions.empty ? (
        <IconButton label="New conversation" onClick={actions.newConversation}>
          <Svg>
            <path d="M8 3v10M3 8h10" />
          </Svg>
        </IconButton>
      ) : null}
      {actions ? (
        <IconButton
          label="Open full screen"
          onClick={() => {
            // /ask is pushed on top of the sheet's history entry; taking that entry back would undo the move.
            pushed.current = false;
            actions.openFullScreen();
          }}
        >
          <Svg>
            <path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9" />
          </Svg>
        </IconButton>
      ) : null}
      <IconButton label={expanded ? "Shrink the panel" : "Expand to full height"} onClick={() => setExpanded((value) => !value)} className="lg:hidden">
        <Svg>{expanded ? <path d="m4 6 4 4 4-4" /> : <path d="m4 10 4-4 4 4" />}</Svg>
      </IconButton>
      <IconButton label="Close Ask" onClick={onClose}>
        <Svg>
          <path d="M4 4l8 8M12 4l-8 8" />
        </Svg>
      </IconButton>
    </div>
  );

  return (
    <>
      {/* Phones: the sheet is modal, so the page behind it dims and a tap on it closes the sheet. */}
      {open && !desktop ? <div aria-hidden="true" onClick={onClose} className="fixed inset-0 z-[55] bg-black/30 lg:hidden" /> : null}
      <div
        ref={root}
        id={ASK_PANEL_ID}
        role="dialog"
        aria-modal={desktop ? undefined : true}
        aria-labelledby={titleId}
        tabIndex={-1}
        aria-hidden={open ? undefined : true}
        onKeyDown={onKeyDown}
        className={`oa-ask-panel fixed inset-x-0 bottom-0 z-[56] ${open ? "flex" : "hidden"} flex-col overflow-hidden border-oa-border bg-oa-page outline-none lg:inset-x-auto lg:right-0 lg:top-0 lg:z-[45] lg:h-dvh lg:w-[420px] lg:rounded-none lg:border-l lg:shadow-[-16px_0_40px_-24px_rgba(40,25,10,0.35)] ${
          expanded ? "h-dvh" : "h-[78dvh] rounded-t-2xl border-t shadow-[0_-12px_40px_-16px_rgba(0,0,0,0.3)]"
        }`}
      >
        {viewer ? (
          <AskWorkspace
            variant="panel"
            signedIn={viewer.signedIn}
            plan={viewer.plan}
            initialQuestion={null}
            initialConversation={null}
            initialConversations={[]}
            initialAllowance={viewer.allowance}
            request={effectiveRequest}
            pageContext={pageContext}
            exampleSubject={exampleSubject}
            renderBar={bar}
            onHandedOff={onHandedOff}
          />
        ) : (
          <>
            {bar(null)}
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-[14px] text-oa-muted-fg" role="status">
              {failed ? (
                <>
                  <p>Ask did not load. Check your connection and try again.</p>
                  <button type="button" onClick={loadViewer} className={`rounded-lg border border-oa-border bg-oa-card px-3 py-1.5 text-[14px] font-medium text-oa-fg hover:bg-oa-accent ${FOCUS}`}>
                    Try again
                  </button>
                </>
              ) : (
                <p>Opening Ask…</p>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
