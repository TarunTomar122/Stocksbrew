"use client";

import { useState } from "react";

import { OaButton } from "@/components/oa/button";

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

  if (sent) {
    return (
      <div role="status">
        <p className="text-sm leading-6 text-oa-fg">
          Got it, thanks for the note. I read every message.
        </p>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="mt-2 cursor-pointer text-sm font-medium text-oa-muted-fg outline-none transition-colors hover:text-oa-fg focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]"
        >
          Send another
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm leading-6 text-oa-muted-fg">
        How&apos;s stocksbrew working for you? Bug, idea, or something you want built, send it
        here and I&apos;ll get on it.
      </p>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
        placeholder="What's working, what's broken, what you wish existed…"
        rows={3}
        className="w-full resize-none rounded-2xl border border-oa-border bg-oa-bg px-3.5 py-3 text-sm leading-6 text-oa-fg outline-none transition-colors placeholder:text-oa-muted-fg/70 focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]"
      />
      {error ? (
        <p className="text-xs leading-5 text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <OaButton onClick={() => void handleSubmit()} loading={sending} size="sm">
          {sending ? "Sending…" : "Send"}
        </OaButton>
      </div>
    </div>
  );
}
