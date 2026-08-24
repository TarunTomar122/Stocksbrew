"use client";

import { useEffect, useRef } from "react";

/**
 * Makes the mobile back button close a modal instead of navigating away.
 *
 * Pushes a throwaway history entry while the modal is open. The back button
 * pops that entry (firing popstate) instead of leaving the page, and we
 * close the modal in response. If the modal closes some other way (X button,
 * backdrop click, Escape), we pop the entry ourselves so the history stack
 * doesn't accumulate stale states.
 */
export function useModalBackClose(open: boolean, onClose: () => void): void {
  const pushedRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    if (!window.matchMedia("(max-width: 639px)").matches) return;

    // Keep Next's __NA/tree fields so App Router treats Back as an in-page
    // history restore instead of reloading the previous route.
    const state = window.history.state;
    window.history.pushState(
      { ...(state && typeof state === "object" ? state : {}), __stocksbrewModal: true },
      "",
    );
    pushedRef.current = true;

    function onPopState() {
      pushedRef.current = false;
      onCloseRef.current();
    }

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      if (pushedRef.current) {
        pushedRef.current = false;
        window.history.back();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
