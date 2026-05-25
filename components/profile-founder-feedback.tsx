"use client";

import { useState } from "react";

export function ProfileFounderFeedback() {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: trimmed }),
      });
      if (!res.ok) throw new Error("Failed to send");
      setSent(true);
      setText("");
    } catch {
      setError("Could not send. Try again?");
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="border-t border-outline-variant/20 pt-4">
        <p className="text-[13px] text-on-surface leading-relaxed">
          Got it — thanks for the note. I read every message.
        </p>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="mt-2 text-[12px] font-semibold text-on-surface-variant hover:text-on-surface"
        >
          Send another
        </button>
      </div>
    );
  }

  return (
    <div className="border-t border-outline-variant/20 pt-4 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined text-[18px] text-on-surface-variant mt-0.5 flex-shrink-0">
          mark_chat_unread
        </span>
        <p className="text-sm font-semibold text-on-surface">Direct to the founder</p>
      </div>

      <p className="text-[12px] text-on-surface-variant leading-relaxed">
        How&apos;s stocksbrew working for you? Bug, idea, or something you want built — send it
        here and I&apos;ll get on it :)
      </p>

      <div className="flex flex-col gap-2">
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          placeholder="What's working, what's broken, what you wish existed…"
          rows={2}
          className="w-full rounded-lg border border-outline-variant/30 bg-white px-3 py-2.5 text-[13px] text-on-surface placeholder:text-on-surface-variant/60 outline-none resize-none focus:border-on-surface/40 transition-colors"
        />
        {error && (
          <p className="text-[12px] text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!text.trim() || sending}
            className="inline-flex items-center justify-center h-[36px] rounded-full bg-[#111111] px-4 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
