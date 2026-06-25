"use client";

import { useState } from "react";

export function ProfileFounderFeedback({ embedded = false }: { embedded?: boolean }) {
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

  const shellClass = embedded ? "" : "border-t border-outline-variant/20 pt-4";

  if (sent) {
    return (
      <div className={shellClass}>
        <p className="text-[13px] leading-relaxed text-on-surface">
          Got it — thanks for the note. I read every message.
        </p>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="mt-2 text-[12px] font-semibold text-on-surface-variant transition-colors hover:text-on-surface"
        >
          Send another
        </button>
      </div>
    );
  }

  return (
    <div className={`${shellClass} flex flex-col gap-3`}>
      <p className="text-[13px] leading-relaxed text-on-surface-variant">
        How&apos;s stocksbrew working for you? Bug, idea, or something you want built — send it
        here and I&apos;ll get on it.
      </p>

      <div className="flex flex-col gap-2">
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          placeholder="What's working, what's broken, what you wish existed…"
          rows={3}
          className="w-full resize-none rounded-xl border border-outline-variant bg-surface-container-low px-3.5 py-3 text-[13px] text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/60 focus:border-on-surface/35"
        />
        {error ? (
          <p className="text-[12px] text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!text.trim() || sending}
            className="inline-flex h-10 items-center justify-center rounded-full bg-on-surface px-5 text-[13px] font-semibold text-surface transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
