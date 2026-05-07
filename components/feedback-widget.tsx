"use client";

import { useState, useRef } from "react";

export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const dismiss = () => {
    setOpen(false);
    setSent(false);
    setText("");
    setError("");
  };

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: trimmed }),
      });
      if (!res.ok) throw new Error("Failed to send");
      setSent(true);
      setText("");
      setTimeout(dismiss, 2500);
    } catch {
      setError("Something went wrong. Try again?");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "Escape") dismiss();
  };

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="hidden md:flex fixed right-0 top-1/2 -translate-y-1/2 z-40 items-center gap-2 bg-[#111111] text-white text-[12px] font-semibold px-3 py-2.5 rounded-l-xl shadow-lg hover:bg-[#1f1f1f] transition-all hover:pr-4 group"
          aria-label="Give feedback"
        >
          <span className="material-symbols-outlined text-[16px]">feedback</span>
          <span className="max-w-0 overflow-hidden group-hover:max-w-[200px] transition-all duration-300 whitespace-nowrap">
            Feedback
          </span>
        </button>
      )}

      <div
        className={`hidden md:block fixed right-6 bottom-6 z-50 transition-all duration-500 ease-spring ${
          open ? "translate-x-0 opacity-100" : "translate-x-[120%] opacity-0 pointer-events-none"
        }`}
      >
        <div className="w-[340px] bg-white rounded-2xl border border-[#e5e7eb] shadow-[0_16px_48px_rgba(0,0,0,0.12)] overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div className="flex items-center gap-2.5">
              <span className="material-symbols-outlined text-[20px] text-[#6366f1]">lightbulb</span>
              <span className="text-[14px] font-semibold text-[#111111] tracking-[-0.01em]">
                {sent ? "Thanks!" : "Are we missing something?"}
              </span>
            </div>
            <button
              type="button"
              onClick={dismiss}
              className="flex items-center justify-center h-7 w-7 rounded-full hover:bg-[#f3f4f6] text-[#6b7280] hover:text-[#111111] transition-colors"
              aria-label="Dismiss"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>

          {sent ? (
            <div className="px-5 pb-5">
              <p className="text-[13px] text-[#10b981] leading-relaxed flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                Feedback sent — we read every one.
              </p>
            </div>
          ) : (
            <div className="px-5 pb-5 flex flex-col gap-3">
              <p className="text-[13px] text-[#6b7280] leading-relaxed">
                What feature, data, or insight would make Tikrr better for you?
              </p>
              <textarea
                ref={inputRef}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setError("");
                }}
                onKeyDown={handleKeyDown}
                placeholder="I wish Tikrr had…"
                rows={3}
                autoFocus
                className="w-full rounded-xl border border-[#e5e7eb] bg-[#f9fafb] px-4 py-3 text-[14px] text-[#111111] placeholder:text-[#9ca3af] outline-none resize-none focus:border-[#6366f1] focus:bg-white transition-colors"
              />
              {error && (
                <p className="text-[12px] text-[#ef4444]">{error}</p>
              )}
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[#9ca3af]">
                  ⌘ + Enter to send
                </span>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!text.trim() || sending}
                  className="inline-flex items-center gap-1.5 h-[36px] px-4 rounded-full bg-[#111111] text-white text-[13px] font-semibold tracking-tight disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#1f1f1f] transition-colors"
                >
                  {sending ? (
                    <>
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Sending…
                    </>
                  ) : (
                    "Send feedback"
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
