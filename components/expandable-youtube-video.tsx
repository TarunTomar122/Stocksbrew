"use client";

import { useCallback, useEffect, useId, useState } from "react";
import Image from "next/image";

type Props = {
  videoId: string;
  title: string;
  /** Shown under the play button on the preview */
  previewLabel?: string;
  className?: string;
};

function thumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
}

export function ExpandableYoutubeVideo({
  videoId,
  title,
  previewLabel = "Watch demo",
  className = "",
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [thumbSrc, setThumbSrc] = useState(thumbnailUrl(videoId));
  const titleId = useId();

  const close = useCallback(() => setExpanded(false), []);

  useEffect(() => {
    if (!expanded) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [expanded, close]);

  return (
    <>
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className={`group relative block h-full w-full overflow-hidden bg-[#0b1228] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/30 ${className}`}
        aria-label={`Play video: ${title}`}
      >
        <Image
          src={thumbSrc}
          alt=""
          fill
          sizes="(max-width: 860px) 100vw, 860px"
          className="object-cover opacity-90 transition-opacity duration-200 group-hover:opacity-100 [border-radius:inherit]"
          priority
          onError={() => setThumbSrc(`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`)}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/20 to-black/10 [border-radius:inherit]" />

        <span className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <span className="flex h-[68px] w-[68px] items-center justify-center rounded-full bg-white/95 text-[#111111] shadow-[0_12px_40px_rgba(0,0,0,0.35)] transition-transform duration-200 group-hover:scale-[1.03]">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="currentColor" aria-hidden>
              <path d="M6 4.5l12 6.5-12 6.5V4.5z" />
            </svg>
          </span>
          <span className="rounded-full bg-black/50 px-3 py-1 text-[12px] font-semibold text-white backdrop-blur-sm">
            {previewLabel}
          </span>
        </span>
      </button>

      {expanded ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/75 backdrop-blur-[2px]"
            aria-label="Close video"
            onClick={close}
          />

          <div className="relative z-[1] w-full max-w-[960px]">
            <div className="mb-3 flex items-start justify-between gap-4 px-1">
              <p id={titleId} className="text-[14px] font-medium text-white/90 line-clamp-2">
                {title}
              </p>
              <button
                type="button"
                onClick={close}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
                aria-label="Close"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path
                    d="M4 4l8 8M12 4l-8 8"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            <div
              className="relative w-full overflow-hidden rounded-xl sm:rounded-2xl bg-black shadow-[0_24px_80px_rgba(0,0,0,0.55)] ring-1 ring-white/10"
              style={{ paddingBottom: "56.25%" }}
            >
              <iframe
                src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
                title={title}
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
                className="absolute inset-0 h-full w-full"
                style={{ border: 0 }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
