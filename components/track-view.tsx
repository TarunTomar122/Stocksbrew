"use client";

import { useEffect, useRef } from "react";

import { captureEvent } from "@/lib/posthog";

/**
 * Sends `event` once, the first time this spot scrolls into view. Renders an
 * empty, zero-size span, so it can sit anywhere in a server component without
 * changing the layout.
 */
export function TrackView({ event, properties }: { event: string; properties?: Record<string, string | number | boolean | null> }) {
  const ref = useRef<HTMLSpanElement>(null);
  const sent = useRef(false);
  const key = JSON.stringify(properties ?? {});

  useEffect(() => {
    const node = ref.current;
    if (!node || sent.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (sent.current || !entries.some((entry) => entry.isIntersecting)) return;
        sent.current = true;
        observer.disconnect();
        captureEvent(event, JSON.parse(key) as Record<string, unknown>);
      },
      { threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [event, key]);

  return <span ref={ref} aria-hidden="true" className="block h-0 w-0 overflow-hidden" />;
}
