import Link from "next/link";
import * as React from "react";

import { AgentMark, FOCUS, NOTE_CARD, StepLink, ThreadNoteView } from "@/components/thread/thread-note";
import type { Thread, ThreadDay } from "@/lib/thread/types";

/**
 * The thread's days, oldest first and today last, as a conversation reads. Each day opens under a divider with the
 * agent's mark once; a time shows only when it differs from the note above it.
 */

function DayDivider({ day, today }: { day: ThreadDay; today: boolean }) {
  return (
    <div id={today ? "thread-today" : undefined} className="flex scroll-mt-20 items-center gap-3 py-1" role="separator" aria-label={`${day.label}, ${day.date}`}>
      <span className="h-px flex-1 bg-oa-border" />
      <span className="text-[12.5px] font-medium text-oa-muted-fg">
        {day.label}
        {day.label !== day.date ? <span className="font-normal"> · {day.date}</span> : null}
      </span>
      <span className="h-px flex-1 bg-oa-border" />
    </div>
  );
}

function DayNotes({ day }: { day: ThreadDay }) {
  let lastClock: string | null = null;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <AgentMark className="mt-1.5 hidden sm:flex" />
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          {day.notes.map((note) => {
            const showClock = Boolean(note.clock) && note.clock !== lastClock;
            if (note.clock) lastClock = note.clock;
            return <ThreadNoteView key={note.id} note={note} showClock={showClock} />;
          })}
        </div>
      </div>
    </section>
  );
}

/** A thread with nothing to show yet: one note from the agent saying why, and the one thing to do. */
function OneNote({ text, step }: { text: string; step: { label: string; href: string } | null }) {
  return (
    <div className="flex items-start gap-3">
      <AgentMark className="mt-1" />
      <div className={`${NOTE_CARD} flex-1 px-4 py-3`}>
        <p className="text-pretty text-[15px] leading-[22px] text-oa-fg">{text}</p>
        {step ? (
          <div className="mt-2.5">
            <StepLink step={step} primary />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ThreadView({ thread }: { thread: Thread }) {
  if (thread.status === "no-stocks") {
    return <OneNote text="I don't know your stocks yet. Add the ones you own or watch, and I'll write here every day about what happened to them and what to do next." step={{ label: "Add your stocks", href: "/import" }} />;
  }
  if (thread.status === "pending") {
    return <OneNote text={`I'm still reading up on your ${thread.stocks === 1 ? "stock" : `${thread.stocks} stocks`}. My first notes on ${thread.stocks === 1 ? "it" : "them"} land here once that's done.`} step={{ label: "See your stocks", href: "/portfolio" }} />;
  }
  if (thread.days.length === 0) {
    return (
      <OneNote
        text={thread.status === "unavailable" ? "I couldn't read your stocks' news just now. Reload in a minute." : "Nothing has happened to your stocks yet that needs a note. I'll write here after the next check."}
        step={null}
      />
    );
  }
  const last = thread.days[thread.days.length - 1];
  return (
    <div className="flex flex-col gap-4">
      {thread.days.map((day) => (
        <React.Fragment key={day.day}>
          <DayDivider day={day} today={day === last} />
          <DayNotes day={day} />
        </React.Fragment>
      ))}
    </div>
  );
}

/** The rail's quiet links to the pages the thread draws from. */
export function ThreadLinks({ example }: { example: boolean }) {
  const links = [
    { href: "/briefing", label: example ? "The example's briefing" : "Today's briefing", text: "Every stock's move, its reason and what is coming up." },
    { href: "/inbox", label: "Inbox", text: "Everything your agents found, by kind." },
    { href: "/portfolio", label: example ? "The example's stocks" : "My stocks", text: "What you own, how it is doing and our call on each." },
  ];
  return (
    <nav aria-label="More on your stocks" className={`${NOTE_CARD} overflow-hidden`}>
      <ul className="divide-y divide-oa-border">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} prefetch={false} className={`block px-4 py-2.5 transition-colors hover:bg-oa-accent ${FOCUS}`}>
              <span className="block text-[14px] font-medium leading-5 text-oa-fg">{link.label}</span>
              <span className="block text-pretty text-[12.5px] leading-[18px] text-oa-muted-fg">{link.text}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
