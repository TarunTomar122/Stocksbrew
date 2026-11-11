"use client";

import { useCheck, useThesis } from "@/components/thesis/store";
import { thesisSentence } from "@/lib/thesis";
import { VERDICT_WORDS, type Verdict } from "@/lib/thesis-watch/rules";

const TONE: Record<Verdict, string> = {
  holds: "text-oa-muted-fg",
  weaker: "font-medium text-oa-primary",
  broken: "font-medium text-signal-bearish",
  played_out: "font-medium text-oa-fg",
};

/**
 * One quiet word on a Portfolio row, only when the person's reason needs a
 * look: "Reason weaker", "Reason broken" or "Reason played out". A reason that
 * still holds, or one not checked yet, shows nothing on the row (the line above
 * the table already counts them, and the same words on every row are noise:
 * owner, Nov 11). The full reason and the note are on the stock page.
 */
export function ThesisLine({ instrumentId }: { instrumentId: string; inline?: boolean }) {
  const thesis = useThesis(instrumentId);
  const { check } = useCheck(instrumentId);
  if (!thesis || !check || check.verdict === "holds") return null;
  const word = VERDICT_WORDS[check.verdict];
  const title = `${thesisSentence(thesis)} ${check.headline}`;
  return (
    <span title={title} className={`block whitespace-nowrap text-[12px] leading-4 ${TONE[check.verdict]}`}>
      <span className="sr-only">{title}</span>
      <span aria-hidden="true">{word}</span>
    </span>
  );
}
