"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { OaButton } from "@/components/oa/button";
import { StockLogo } from "@/components/stock-logo";
import { trackBasketCreated } from "@/lib/product-analytics";
import {
  ASK_HANDOFF_KEY,
  KIND_WORDS,
  MAX_IDEA,
  MAX_LINES,
  MAX_NAME,
  MAX_REASON,
  MIN_LINES,
  mainKind,
  reasonText,
  type BasketDraft,
  type BasketLineDraft,
} from "@/lib/basket-agent/model";
import type { BasketReplayResult } from "@/lib/basket-agent/data";
import {
  currentFirebaseUser,
  signedInNow,
  signInWithGoogle,
} from "@/lib/sign-in";
import { THESIS_KINDS, type ThesisKind } from "@/lib/thesis";

import {
  Box as Panel,
  CardRows,
  CompanyCard,
  ReplayView,
  type CardQuote,
} from "./parts";

/**
 * The "Add a company" tile takes the columns the last row has left (or a row of its own), so no row of the grid ends
 * with an empty column at any width.
 */
function addSpan(cards: number): string {
  const two =
    cards % 2 === 0
      ? "[@container(min-width:34rem)]:col-span-2"
      : "[@container(min-width:34rem)]:col-span-1";
  const left = 3 - (cards % 3);
  const three =
    left === 3
      ? "[@container(min-width:52rem)]:col-span-3"
      : left === 2
        ? "[@container(min-width:52rem)]:col-span-2"
        : "[@container(min-width:52rem)]:col-span-1";
  return `${two} ${three}`;
}

type Suggestion = { ticker: string; company: string | null; reason: string };

/** The editor's work before a sign-in, kept in this tab so the reload after it does not lose it. */
const DRAFT_KEY = "stocksbrew:basket-editor";

const FIELD =
  "w-full rounded-md border border-oa-border bg-oa-card px-3 py-2 text-[14px] leading-5 text-oa-fg outline-none placeholder:text-oa-muted-fg focus:border-[color-mix(in_srgb,var(--oa-fg)_40%,transparent)]";

/** Whether the replay still describes the draft: a new name changes nothing it checked. */
function sameDraft(a: BasketDraft, b: BasketDraft): boolean {
  return (
    JSON.stringify([a.idea, a.lines]) === JSON.stringify([b.idea, b.lines])
  );
}

/**
 * The basket editor: name the idea, say it in your own words, take companies out, add one, rewrite a reason or change
 * its kind. A company is edited by opening its card (no buttons repeated on every card). New baskets replay the last
 * four weeks before they can switch on; an existing one saves in place.
 */
export function BasketEditor({
  initial,
  suggestions: initialSuggestions,
  quotes,
  signedIn,
  today,
  basketId = null,
  version = null,
  onDone,
  shorts = {},
}: {
  initial: BasketDraft;
  suggestions: Suggestion[];
  quotes: Record<string, CardQuote>;
  signedIn: boolean;
  today: string;
  /** Editing a saved basket: saves with PATCH and calls `onDone`. */
  basketId?: string | null;
  /** The saved basket's version: a save over a newer one (an accepted proposal) is refused, not merged. */
  version?: number | null;
  /** Our short card line for a reviewed reason, by ticker: shown while the company keeps that reason. */
  shorts?: Record<string, { short: string; reasons: string[] }>;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [name, setName] = React.useState(initial.name);
  const [idea, setIdea] = React.useState(initial.idea);
  const [lines, setLines] = React.useState<BasketLineDraft[]>(initial.lines);
  const [suggestions, setSuggestions] = React.useState(initialSuggestions);
  const [open, setOpen] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState("");
  const [busy, setBusy] = React.useState<"replay" | "save" | "signin" | null>(
    null,
  );
  const [error, setError] = React.useState<string | null>(null);
  const [replay, setReplay] = React.useState<{
    draft: BasketDraft;
    result: BasketReplayResult;
  } | null>(null);

  // Work from before a sign-in comes back after its reload, on this same address only.
  React.useEffect(() => {
    if (basketId) return;
    try {
      const raw = window.sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      window.sessionStorage.removeItem(DRAFT_KEY);
      const kept = JSON.parse(raw) as {
        at?: string;
        name?: string;
        idea?: string;
        lines?: BasketLineDraft[];
      };
      if (kept.at !== window.location.pathname + window.location.search) return;
      if (typeof kept.name === "string") setName(kept.name);
      if (typeof kept.idea === "string") setIdea(kept.idea);
      if (Array.isArray(kept.lines) && kept.lines.length > 0)
        setLines(kept.lines);
    } catch {
      // Nothing kept: the basket comes from the address.
    }
  }, [basketId]);

  // Reasons from an Ask answer for this same idea, kept for the companies whose reason the page could not fill.
  React.useEffect(() => {
    if (initial.source.kind !== "ask") return;
    try {
      const raw = window.sessionStorage.getItem(ASK_HANDOFF_KEY);
      if (!raw) return;
      const handed = JSON.parse(raw) as {
        idea?: string;
        lines?: Array<{ ticker?: string; reason?: string; company?: string }>;
      };
      if (
        String(handed.idea ?? "")
          .replace(/\s+/g, " ")
          .trim() !== initial.idea
      )
        return;
      const byTicker = new Map(
        (handed.lines ?? []).map((line) => [
          String(line.ticker ?? "").toUpperCase(),
          line,
        ]),
      );
      setLines((current) =>
        current.map((line) => {
          const found = byTicker.get(line.ticker);
          return found
            ? {
                ...line,
                reason: line.reason || reasonText(String(found.reason ?? "")),
                company: line.company ?? found.company ?? null,
              }
            : line;
        }),
      );
    } catch {
      // Nothing handed over: the reasons stay as the page filled them.
    }
  }, [initial.source.kind, initial.idea]);

  // The idea's field grows with what is in it, so a long idea is never cut off (a phone shows all of it).
  const ideaRef = React.useRef<HTMLTextAreaElement>(null);
  React.useLayoutEffect(() => {
    const field = ideaRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${field.scrollHeight + 2}px`;
  }, [idea]);

  const draft: BasketDraft = {
    name: name.trim() || initial.name,
    idea: idea.trim(),
    source: initial.source,
    lines,
  };
  const kind = mainKind(lines, idea);
  const replayFresh = replay !== null && sameDraft(replay.draft, draft);
  const missingReasons = lines.filter((line) => !line.reason.trim());
  // Companies that came with no reason keep their inline field until the reason is saved, so it does not vanish mid-typing.
  const [needs, setNeeds] = React.useState<Set<string>>(
    () =>
      new Set(
        initial.lines
          .filter((line) => !line.reason.trim())
          .map((line) => line.ticker),
      ),
  );
  React.useEffect(() => {
    setNeeds((current) => {
      const next = new Set(current);
      for (const line of lines) if (!line.reason.trim()) next.add(line.ticker);
      return next.size === current.size ? current : next;
    });
  }, [lines]);
  const missingReason = missingReasons[0];
  const problem = !idea.trim()
    ? "Say the idea in a sentence."
    : lines.length < MIN_LINES
      ? `Keep at least ${MIN_LINES} companies.`
      : missingReason
        ? `Give ${missingReason.ticker} a reason.`
        : null;

  const patchLine = (ticker: string, patch: Partial<BasketLineDraft>) =>
    setLines((current) =>
      current.map((line) =>
        line.ticker === ticker ? { ...line, ...patch } : line,
      ),
    );
  const remove = (ticker: string) => {
    const line = lines.find((entry) => entry.ticker === ticker);
    setLines((current) => current.filter((entry) => entry.ticker !== ticker));
    if (line && line.reason)
      setSuggestions((current) => [
        { ticker, company: line.company, reason: line.reason },
        ...current.filter((entry) => entry.ticker !== ticker),
      ]);
    setOpen(null);
  };
  const add = (entry: Suggestion) => {
    if (
      lines.length >= MAX_LINES ||
      lines.some((line) => line.ticker === entry.ticker)
    )
      return;
    setLines((current) => [
      ...current,
      {
        ticker: entry.ticker,
        company: entry.company,
        kind,
        reason: entry.reason,
      },
    ]);
    setSuggestions((current) =>
      current.filter((item) => item.ticker !== entry.ticker),
    );
    // A company added by ticker has no reason yet: open it so the reason is written now.
    if (!entry.reason) setOpen(entry.ticker);
  };
  const addTyped = () => {
    const ticker = adding.trim().toUpperCase().replace(/^\$/, "");
    if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(ticker))
      return setError("Type a ticker, like VRT.");
    if (lines.some((line) => line.ticker === ticker))
      return setError(`${ticker} is already in the basket.`);
    if (lines.length >= MAX_LINES)
      return setError(`A basket holds up to ${MAX_LINES} companies.`);
    setError(null);
    const suggested = suggestions.find((entry) => entry.ticker === ticker);
    add(suggested ?? { ticker, company: null, reason: "" });
    setAdding("");
  };

  /** Signs in, then reloads so the page and the routes see the session; the work so far is kept in this tab. */
  const signIn = async () => {
    setBusy("signin");
    try {
      try {
        window.sessionStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({
            at: window.location.pathname + window.location.search,
            name,
            idea,
            lines,
          }),
        );
      } catch {
        // Storage blocked: the basket comes back from the address.
      }
      if (!(signedInNow() ?? Boolean(await currentFirebaseUser())))
        await signInWithGoogle({ surface: "unknown" });
      window.location.reload();
    } catch {
      setBusy(null);
    }
  };

  const runReplay = async () => {
    if (problem) return setError(problem);
    if (!signedIn) return signIn();
    setBusy("replay");
    setError(null);
    try {
      const response = await fetch("/api/basket-agents/replay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      const body = (await response.json().catch(() => null)) as {
        ok?: boolean;
        replay?: BasketReplayResult;
        error?: string;
      } | null;
      if (!response.ok || !body?.replay)
        throw new Error(
          body?.error || "The replay didn't finish. Try again in a minute.",
        );
      setReplay({ draft, result: body.replay });
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The replay didn't finish. Try again in a minute.",
      );
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (problem) return setError(problem);
    if (!signedIn) return signIn();
    setBusy("save");
    setError(null);
    try {
      const response = await fetch(
        basketId
          ? `/api/basket-agents/${encodeURIComponent(basketId)}`
          : "/api/basket-agents",
        {
          method: basketId ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(basketId ? { basket: draft, version } : draft),
        },
      );
      const body = (await response.json().catch(() => null)) as {
        ok?: boolean;
        basket?: { id: string };
        paused?: { feature?: string } | null;
        error?: string;
      } | null;
      if (!response.ok || !body?.ok)
        throw new Error(
          body?.error || "That didn't save. Try again in a minute.",
        );
      try {
        window.sessionStorage.removeItem(ASK_HANDOFF_KEY);
      } catch {
        // Storage blocked: nothing to clear.
      }
      if (basketId) {
        if (onDone) onDone();
        else router.push(`/agents/baskets/${encodeURIComponent(basketId)}`);
        router.refresh();
        return;
      }
      trackBasketCreated({ kind: initial.source.kind });
      // Saved paused at the plan's limit: the basket's page says why, with the plan's lock card.
      router.push(`/agents/baskets/${encodeURIComponent(body.basket!.id)}`);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "That didn't save. Try again in a minute.",
      );
      setBusy(null);
    }
  };

  const openLine = lines.find((line) => line.ticker === open) ?? null;
  const openIndex = openLine ? lines.indexOf(openLine) : -1;

  const primary = basketId
    ? { label: "Save changes", run: save, loading: busy === "save" }
    : !signedIn
      ? {
          label: "Sign in to watch this idea",
          run: signIn,
          loading: busy === "signin",
        }
      : replayFresh
        ? { label: "Watch this idea", run: save, loading: busy === "save" }
        : {
            label: "Replay the last 4 weeks",
            run: runReplay,
            loading: busy === "replay",
          };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Panel>
        <div className="grid gap-3 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-[12.5px] font-medium text-oa-muted-fg">
              Name
            </span>
            <input
              value={name}
              maxLength={MAX_NAME}
              onChange={(event) => setName(event.target.value)}
              className={FIELD}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-[12.5px] font-medium text-oa-muted-fg">
              The idea, in your words
            </span>
            <textarea
              ref={ideaRef}
              value={idea}
              maxLength={MAX_IDEA}
              rows={1}
              onChange={(event) => setIdea(event.target.value)}
              placeholder="Power for AI data centers"
              className={`${FIELD} resize-none overflow-hidden`}
            />
          </label>
        </div>
      </Panel>

      <section aria-label="Companies" className="flex min-w-0 flex-col gap-2">
        <h2 className="flex items-baseline gap-2 px-1 text-[15px] font-semibold leading-6 text-oa-fg">
          Companies
          <span className="oa-mono text-[13px] font-medium tabular-nums text-oa-muted-fg">
            {lines.length} · {KIND_WORDS[kind].toLowerCase()} reasons
          </span>
          {missingReasons.length > 0 ? (
            <span className="text-[13px] font-medium text-oa-primary">
              {missingReasons.length === 1
                ? `${missingReasons[0]!.ticker} needs a reason`
                : `${missingReasons.length} need a reason`}
            </span>
          ) : null}
        </h2>
        <CardRows>
          {lines.map((line, index) => (
            <React.Fragment key={line.ticker}>
              <CompanyCard
                ticker={line.ticker}
                company={line.company}
                quote={quotes[line.ticker] ?? null}
                line={
                  needs.has(line.ticker)
                    ? ""
                    : shorts[line.ticker]?.reasons.includes(line.reason)
                      ? shorts[line.ticker]!.short
                      : line.reason
                }
                kind={line.kind !== kind ? line.kind : null}
                onSelect={() =>
                  setOpen((current) =>
                    current === line.ticker ? null : line.ticker,
                  )
                }
                selected={open === line.ticker}
                eager={index < 6}
              >
                {needs.has(line.ticker) ? (
                  <>
                    <textarea
                      value={line.reason}
                      maxLength={MAX_REASON}
                      rows={2}
                      aria-label={`Why ${line.ticker} carries the idea`}
                      placeholder={`Why ${line.ticker} carries the idea`}
                      onChange={(event) =>
                        patchLine(line.ticker, { reason: event.target.value })
                      }
                      className={`${FIELD} resize-none`}
                    />
                    <select
                      value={line.kind}
                      aria-label={`What the agent checks ${line.ticker} on`}
                      onChange={(event) =>
                        patchLine(line.ticker, {
                          kind: event.target.value as ThesisKind,
                        })
                      }
                      className={`${FIELD} py-1.5`}
                    >
                      {THESIS_KINDS.map((option) => (
                        <option key={option} value={option}>
                          Checked as {KIND_WORDS[option].toLowerCase()}
                        </option>
                      ))}
                    </select>
                  </>
                ) : null}
              </CompanyCard>
              {index === openIndex && openLine ? (
                <li className="col-span-full">
                  <div className="oa-surface flex min-w-0 flex-col gap-3 border border-oa-border bg-oa-card p-3.5">
                    <label className="flex min-w-0 flex-col gap-1">
                      <span className="text-[12.5px] font-medium text-oa-muted-fg">
                        Why {openLine.ticker} carries the idea
                      </span>
                      <textarea
                        value={openLine.reason}
                        maxLength={MAX_REASON}
                        rows={2}
                        autoFocus
                        onChange={(event) =>
                          patchLine(openLine.ticker, {
                            reason: event.target.value,
                          })
                        }
                        className={`${FIELD} resize-none`}
                      />
                    </label>
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="text-[12.5px] font-medium text-oa-muted-fg">
                        What the agent checks it on
                      </span>
                      <div
                        className="flex flex-wrap gap-1.5"
                        role="radiogroup"
                        aria-label="Kind of reason"
                      >
                        {THESIS_KINDS.map((option: ThesisKind) => (
                          <button
                            key={option}
                            type="button"
                            role="radio"
                            aria-checked={openLine.kind === option}
                            onClick={() =>
                              patchLine(openLine.ticker, { kind: option })
                            }
                            className={`rounded-md border px-2.5 py-1 text-[13px] ${openLine.kind === option ? "border-oa-fg bg-oa-fg text-oa-bg" : "border-oa-border bg-oa-card text-oa-fg hover:bg-oa-accent"}`}
                          >
                            {KIND_WORDS[option]}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <OaButton
                        size="sm"
                        variant="secondary"
                        onClick={() => setOpen(null)}
                      >
                        Done
                      </OaButton>
                      <OaButton
                        size="sm"
                        variant="ghost"
                        onClick={() => remove(openLine.ticker)}
                        className="text-signal-bearish"
                      >
                        Take {openLine.ticker} out
                      </OaButton>
                    </div>
                  </div>
                </li>
              ) : null}
            </React.Fragment>
          ))}
          {lines.length < MAX_LINES ? (
            <li
              className={`oa-surface flex h-full min-w-0 flex-col gap-2.5 border border-dashed border-oa-border bg-transparent px-3.5 pb-3 pt-3 ${addSpan(lines.length)}`}
            >
              <p className="text-[14px] font-semibold text-oa-fg">
                Add a company
              </p>
              <form
                className="flex min-w-0 items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  addTyped();
                }}
              >
                <input
                  value={adding}
                  onChange={(event) => setAdding(event.target.value)}
                  placeholder="Ticker"
                  aria-label="Ticker to add"
                  className={`${FIELD} oa-mono min-w-0 flex-1 uppercase`}
                />
                <OaButton size="sm" variant="secondary" type="submit">
                  Add
                </OaButton>
              </form>
              {suggestions.length > 0 ? (
                <ul
                  className="flex min-w-0 flex-wrap gap-1.5"
                  aria-label="Companies that fit the idea"
                >
                  {suggestions.slice(0, 6).map((entry) => (
                    <li key={entry.ticker}>
                      <button
                        type="button"
                        title={entry.reason}
                        onClick={() => add(entry)}
                        className="flex h-8 items-center gap-1.5 rounded-md border border-oa-border bg-oa-card px-2 text-[13px] text-oa-fg hover:bg-oa-accent"
                      >
                        <StockLogo ticker={entry.ticker} size={18} />
                        <span className="oa-mono font-medium">
                          {entry.ticker}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ) : null}
        </CardRows>
      </section>

      {replay ? (
        <Panel
          flush
          label="What it would have done"
          right={replayFresh ? null : <span>Changed since the replay</span>}
        >
          <ReplayView replay={replay.result} today={today} quotes={quotes} />
        </Panel>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-1">
        <OaButton
          loading={primary.loading}
          disabled={busy !== null}
          onClick={() => void primary.run()}
        >
          {primary.label}
        </OaButton>
        {basketId ? (
          <OaButton
            variant="secondary"
            disabled={busy !== null}
            onClick={() =>
              onDone
                ? onDone()
                : router.push(`/agents/baskets/${encodeURIComponent(basketId)}`)
            }
          >
            Cancel
          </OaButton>
        ) : null}
        {error ? (
          <p role="alert" className="text-[13px] text-signal-bearish">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
