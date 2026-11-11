"use client";

import { createContext, useContext, useId, useState } from "react";

import { DEFAULT_AMOUNT, addSentence, fmtAmount, parseAmount, type IdeaStock } from "@/lib/dividend-ideas";

/** Just what the line needs, so the reason text is not sent to the browser twice. */
export type AddLineStock = Pick<IdeaStock, "name" | "price" | "annualPerShare" | "payMonths">;

/**
 * The one interactive bit of "For more dividend income": the amount a reader
 * tries, and every row's "Putting $1,000 in ... would add about $X a year"
 * line that follows it. The rest of the section renders on the server.
 */

const AmountContext = createContext<number>(DEFAULT_AMOUNT);

const MONO = "oa-mono tabular-nums";

export function IdeasAmount({ children }: { children: React.ReactNode }) {
  const inputId = useId();
  const [text, setText] = useState(fmtAmount(DEFAULT_AMOUNT).slice(1));
  const [amount, setAmount] = useState(DEFAULT_AMOUNT);
  return (
    <AmountContext.Provider value={amount}>
      <div className="border-b border-oa-border px-4 py-3">
        <label htmlFor={inputId} className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[13.5px] text-oa-fg">
          Try an amount:
          <span className="inline-flex h-8 items-center rounded-md border border-oa-border bg-oa-page pl-2.5 focus-within:border-oa-primary">
            <span aria-hidden="true" className={`${MONO} text-[14px] text-oa-muted-fg`}>
              $
            </span>
            <input
              id={inputId}
              inputMode="decimal"
              autoComplete="off"
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                const next = parseAmount(event.target.value);
                if (next != null) setAmount(next);
              }}
              // Tidy what was typed ("2500" -> "2,500"), or put back the last amount that worked.
              onBlur={() => setText(fmtAmount(amount).slice(1))}
              onKeyDown={(event) => {
                if (event.key === "Enter") (event.target as HTMLInputElement).blur();
              }}
              className={`${MONO} h-full w-[6.5rem] bg-transparent px-1.5 text-[14px] text-oa-fg outline-none`}
            />
          </span>
        </label>
      </div>
      {children}
    </AmountContext.Provider>
  );
}

/** "Putting $1,000 in Coca-Cola would add about $26 a year, paid in Apr, Jul, Oct and Dec." plus what it fills. */
export function AddLine({ stock, fills }: { stock: AddLineStock; fills?: string | null }) {
  const amount = useContext(AmountContext);
  const line = addSentence(stock, amount);
  if (!line && !fills) return null;
  return (
    <span className="text-oa-fg">
      {[line, fills].filter(Boolean).join(" ")}
    </span>
  );
}
