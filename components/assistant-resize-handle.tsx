"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const ASSISTANT_WIDTH_KEY = "tikrr-radar-chat-width";
export const ASSISTANT_WIDTH_DEFAULT = 380;
export const ASSISTANT_WIDTH_MIN = 300;
export const ASSISTANT_WIDTH_MAX = 560;

export function clampAssistantWidth(width: number): number {
  return Math.min(ASSISTANT_WIDTH_MAX, Math.max(ASSISTANT_WIDTH_MIN, Math.round(width)));
}

export function readStoredAssistantWidth(): number {
  try {
    const stored = localStorage.getItem(ASSISTANT_WIDTH_KEY);
    if (!stored) return ASSISTANT_WIDTH_DEFAULT;
    const parsed = Number(stored);
    return Number.isFinite(parsed) ? clampAssistantWidth(parsed) : ASSISTANT_WIDTH_DEFAULT;
  } catch {
    return ASSISTANT_WIDTH_DEFAULT;
  }
}

type AssistantResizeHandleProps = {
  width: number;
  onWidthChange: (width: number) => void;
};

export function AssistantResizeHandle({ width, onWidthChange }: AssistantResizeHandleProps) {
  const [dragging, setDragging] = useState(false);
  const widthRef = useRef(width);

  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  useEffect(() => {
    if (!dragging) return;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragging]);

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      const next = clampAssistantWidth(window.innerWidth - event.clientX);
      widthRef.current = next;
      onWidthChange(next);
    },
    [onWidthChange],
  );

  const stopDragging = useCallback(() => {
    setDragging(false);
    try {
      localStorage.setItem(ASSISTANT_WIDTH_KEY, String(widthRef.current));
    } catch {
      // ignore
    }
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", stopDragging);
    window.removeEventListener("pointercancel", stopDragging);
  }, [onPointerMove]);

  const startDragging = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
      onPointerMove(event.nativeEvent);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", stopDragging);
      window.addEventListener("pointercancel", stopDragging);
    },
    [onPointerMove, stopDragging],
  );

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={width}
      aria-valuemin={ASSISTANT_WIDTH_MIN}
      aria-valuemax={ASSISTANT_WIDTH_MAX}
      aria-label="Resize assistant panel"
      onPointerDown={startDragging}
      className={`absolute left-0 top-0 z-10 h-full w-2 -translate-x-1/2 cursor-col-resize touch-none select-none ${
        dragging ? "bg-[#111111]/15" : "bg-transparent hover:bg-[#111111]/8"
      }`}
    >
      <div
        className={`absolute left-1/2 top-0 h-full w-px -translate-x-1/2 ${
          dragging ? "bg-[#111111]" : "bg-[#e5e7eb]"
        }`}
      />
    </div>
  );
}
