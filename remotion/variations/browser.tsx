import React, { useRef, useEffect, useState } from "react";
import { AbsoluteFill, useCurrentScale, interpolate } from "remotion";
import { FONT, MONO } from "../fonts";
import { T } from "../theme";

// Scrolls content by only its real overflow past `viewportH`, so it never
// scrolls into empty space. Measures the content node each render.
export function useAutoScroll(viewportH: number, frame: number, from: number, to: number) {
  const ref = useRef<HTMLDivElement>(null);
  const scale = useCurrentScale();
  const [contentH, setContentH] = useState(0);
  useEffect(() => {
    if (ref.current) setContentH(ref.current.getBoundingClientRect().height / scale);
  }, [scale]);
  const overflow = Math.max(0, contentH - viewportH);
  const scroll = interpolate(frame, [from, to], [0, -overflow], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return { ref, scroll };
}

// Shared browser chrome for the "search" variations.
export function Wallpaper({ children }: { children: React.ReactNode }) {
  return (
    <AbsoluteFill style={{ background: "linear-gradient(150deg,#dfe7ee 0%,#eef1f5 40%,#e6edf3 100%)" }}>
      <AbsoluteFill style={{ background: "radial-gradient(60% 50% at 50% 30%, rgba(4,120,87,0.07), transparent 70%)" }} />
      {children}
    </AbsoluteFill>
  );
}

export function Cursor({ x, y, click = false }: { x: number; y: number; click?: boolean }) {
  return (
    <div style={{ position: "absolute", left: x, top: y, transform: "translate(-2px,-2px)", zIndex: 50 }}>
      {click && <div style={{ position: "absolute", left: -18, top: -18, width: 44, height: 44, borderRadius: 99, border: "3px solid rgba(4,120,87,0.5)" }} />}
      <svg width="34" height="34" viewBox="0 0 24 24" fill="#111215" stroke="#fff" strokeWidth="1.5"><path d="M4 2l6 16 2.5-6.5L19 9 4 2z" /></svg>
    </div>
  );
}

export function BrowserFrame({ url, tab, children, secure = true }: { url: React.ReactNode; tab?: string; children: React.ReactNode; secure?: boolean }) {
  return (
    <div style={{ width: 1640, height: 880, borderRadius: 18, overflow: "hidden", background: T.surface, boxShadow: "0 50px 110px rgba(17,24,39,0.28), 0 10px 30px rgba(17,24,39,0.1)", border: "1px solid rgba(0,0,0,0.06)", display: "flex", flexDirection: "column" }}>
      {/* tab strip */}
      <div style={{ height: 52, background: "#dfe3e8", display: "flex", alignItems: "flex-end", paddingLeft: 22, gap: 14 }}>
        <div style={{ display: "flex", gap: 9, alignItems: "center", paddingBottom: 16 }}>
          <span style={{ width: 13, height: 13, borderRadius: 99, background: "#ff5f57" }} />
          <span style={{ width: 13, height: 13, borderRadius: 99, background: "#febc2e" }} />
          <span style={{ width: 13, height: 13, borderRadius: 99, background: "#28c840" }} />
        </div>
        {tab && (
          <div style={{ height: 38, background: T.surface, borderRadius: "10px 10px 0 0", padding: "0 22px", display: "flex", alignItems: "center", gap: 10, fontFamily: FONT, fontSize: 18, fontWeight: 600, color: T.ink, maxWidth: 360 }}>
            <span style={{ width: 16, height: 16, borderRadius: 4, background: "#047857" }} />
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tab}</span>
          </div>
        )}
      </div>
      {/* address bar */}
      <div style={{ height: 64, background: T.surface, borderBottom: `1px solid ${T.outline}`, display: "flex", alignItems: "center", gap: 18, padding: "0 26px" }}>
        <span style={{ color: "#9aa3af", fontSize: 24 }}>‹</span>
        <span style={{ color: "#cbd2da", fontSize: 24 }}>›</span>
        <span style={{ color: "#9aa3af", fontSize: 22 }}>⟳</span>
        <div style={{ flex: 1, height: 42, background: "#f0f2f5", borderRadius: 999, display: "flex", alignItems: "center", gap: 12, padding: "0 20px", fontFamily: FONT, fontSize: 21, color: T.ink }}>
          {secure ? <span style={{ color: "#6b7280", fontSize: 18 }}>🔒</span> : <span style={{ color: "#9aa3af", fontSize: 18 }}>🔎</span>}
          {url}
        </div>
      </div>
      {/* viewport */}
      <div style={{ flex: 1, background: T.bg, position: "relative", overflow: "hidden" }}>{children}</div>
    </div>
  );
}

// Vertical mobile browser (Safari-style, bottom URL bar)
export function MobileBrowser({ url, children }: { url: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ width: 960, height: 1740, borderRadius: 56, overflow: "hidden", background: T.surface, boxShadow: "0 50px 110px rgba(17,24,39,0.3)", border: "10px solid #111215", display: "flex", flexDirection: "column" }}>
      {/* status bar */}
      <div style={{ height: 70, background: T.surface, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 50px", fontFamily: FONT, fontWeight: 700, fontSize: 28, color: T.ink }}>
        <span>9:41</span>
        <span style={{ fontSize: 22, letterSpacing: 2 }}>● ● ●  ▮</span>
      </div>
      {/* content */}
      <div style={{ flex: 1, background: T.bg, position: "relative", overflow: "hidden" }}>{children}</div>
      {/* bottom URL bar */}
      <div style={{ background: T.surface, borderTop: `1px solid ${T.outline}`, padding: "20px 40px 34px" }}>
        <div style={{ height: 64, background: "#f0f2f5", borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", gap: 12, fontFamily: FONT, fontSize: 28, color: T.ink }}>
          <span style={{ fontSize: 22 }}>🔎</span>{url}
        </div>
      </div>
    </div>
  );
}
