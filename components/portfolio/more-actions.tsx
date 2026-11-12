"use client";

import * as React from "react";

/** A line in the menu: pass it as the className of each action's own button or link. Their icons are left out. */
export const MORE_ITEM =
  "flex w-full cursor-pointer items-center rounded-md px-2.5 py-2 text-left text-[13.5px] font-medium leading-5 text-oa-fg outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent [&_svg]:hidden";

/** Room kept under the menu on a phone for the fixed bottom nav (components/oa/mobile-nav.tsx). */
const NAV_ROOM = 76;

/** The menu's lines: the actions' own buttons and links, not a dialog one of them has open. */
function menuItems(panel: HTMLElement | null): HTMLElement[] {
  return Array.from(panel?.children ?? []).filter((el): el is HTMLElement => el instanceof HTMLElement && el.getAttribute("role") !== "dialog");
}

/**
 * The chevron joined to My stocks' one button ("Add or edit stocks"), opening a small menu with the other actions
 * (owner, Nov 12: "do we need 5 buttons at once???"). The actions are their own components (import, share, ask), each
 * with its own dialog next to its button, so they stay mounted: closed, only their buttons are hidden and a dialog one
 * of them opened still shows. Arrow keys move through the menu, Escape and a click outside close it, and it opens
 * upward when the bottom nav would cover it.
 */
export function MoreActions({ className, children }: { className: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [up, setUp] = React.useState(false);
  const root = React.useRef<HTMLDivElement>(null);
  const panel = React.useRef<HTMLDivElement>(null);
  const button = React.useRef<HTMLButtonElement>(null);
  const id = React.useId();
  // Set when an action is picked from the open menu, so the dialog it opens hands focus back to the chevron on close.
  const launched = React.useRef(false);

  // A dialog an action opened sits in the panel; when it goes, focus comes back to the chevron (its own button is
  // hidden, so the dialog's own focus return finds nothing), unless something else already took focus.
  React.useEffect(() => {
    const node = panel.current;
    if (!node) return;
    const observer = new MutationObserver(() => {
      if (!launched.current || node.querySelector(":scope > [role=dialog]")) return;
      launched.current = false;
      requestAnimationFrame(() => {
        if (!document.activeElement || document.activeElement === document.body) button.current?.focus();
      });
    });
    observer.observe(node, { childList: true });
    return () => observer.disconnect();
  }, []);

  React.useLayoutEffect(() => {
    if (!open) {
      setUp(false);
      return;
    }
    const box = panel.current?.getBoundingClientRect();
    const anchor = root.current?.getBoundingClientRect();
    if (box && anchor) {
      const floor = window.innerHeight - (window.matchMedia("(min-width: 1024px)").matches ? 8 : NAV_ROOM);
      setUp(box.bottom > floor && anchor.top - box.height - 6 > 8);
    }
    menuItems(panel.current)[0]?.focus();
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const onPanelKey = (event: React.KeyboardEvent) => {
    // Closed, the keys belong to whatever dialog an action has open (the import box's text, say).
    if (!open) return;
    const list = menuItems(panel.current);
    const at = list.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === "ArrowDown" ? (at + 1) % list.length
      : event.key === "ArrowUp" ? (at - 1 + list.length) % list.length
      : event.key === "Home" ? 0
      : event.key === "End" ? list.length - 1
      : null;
    if (next === null || list.length === 0) return;
    event.preventDefault();
    list[next]?.focus();
  };

  return (
    <div
      ref={root}
      className="relative inline-flex"
      onBlur={(event) => {
        // Tabbing out of the menu closes it. A blur to nothing (Safari does not focus a clicked button) is left to
        // the outside-click close, or it would hide the item before its click lands.
        const to = event.relatedTarget as Node | null;
        if (open && to && !root.current?.contains(to)) setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        aria-label="More: import, share, ask"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={className}
      >
        <svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M2.5 4.5 6 8l3.5-3.5" />
        </svg>
      </button>
      {/* Always mounted, so a dialog an action opened outlives the menu; closed, only the actions' own buttons hide. */}
      <div
        ref={panel}
        id={id}
        onKeyDown={onPanelKey}
        onClickCapture={() => {
          if (open) launched.current = true;
          setOpen(false);
        }}
        className={
          open
            ? `oa-surface absolute left-0 z-40 flex w-56 max-w-[calc(100vw-2rem)] flex-col border border-oa-border bg-oa-card p-1 shadow-[0_14px_40px_-12px_rgba(0,0,0,0.35)] lg:left-auto lg:right-0 ${up ? "bottom-[calc(100%+6px)]" : "top-[calc(100%+6px)]"}`
            : "contents [&>*:not([role=dialog])]:hidden"
        }
      >
        {children}
      </div>
    </div>
  );
}
