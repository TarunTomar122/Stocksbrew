"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { OaButton, Spinner } from "@/components/oa/button";
import { KindIcon } from "@/components/oa/nav-icon";
import { StockLogo } from "@/components/stock-logo";
import type { RecipeId } from "@/lib/agent-recipes/recipes";
import type { RecipeContext, RecipeReplay, RecipeRow } from "@/lib/agent-recipes/server";
import { HISTORY_ROWS } from "@/lib/agent-recipes/view";
import { signInWithGoogle } from "@/lib/sign-in";

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";
const NUM = "oa-mono tabular-nums";

type Loaded<T> = { state: "loading" } | { state: "ready"; value: T } | { state: "error"; message: string };

async function readJson<T>(response: Response): Promise<T & { error?: string }> {
  return ((await response.json().catch(() => null)) ?? {}) as T & { error?: string };
}

function initials(name: string): string {
  const parts = name.replace(/[^A-Za-z\s]/g, " ").trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] ?? "?"}${parts.length > 1 ? parts[parts.length - 1]![0] : ""}`.toUpperCase();
}

/** The subject's face: the stock's logo, an investor's initials, a basket's target. */
function SubjectMark({ kind, name }: { kind: RecipeContext["subject"]["kind"]; name: string }) {
  if (kind === "stock") return <StockLogo ticker={name} size={28} atOnce />;
  if (kind === "basket") {
    return (
      <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-oa-bg text-oa-primary">
        <KindIcon name="target" className="size-4" />
      </span>
    );
  }
  return (
    <span className="oa-mono inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--oa-primary)_14%,transparent)] text-[11.5px] font-semibold text-oa-primary">
      {initials(name)}
    </span>
  );
}

export function sheetTitle(kind: RecipeContext["subject"]["kind"], name: string): string {
  if (kind === "stock") return `Watch ${name} for me`;
  if (kind === "basket") return "Tell me when a line breaks or a filing hits";
  return `Tell me when ${name} trades`;
}

function money(value: number | null): string {
  return value == null ? "" : `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function signed(value: number): string {
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(2)}%`;
}

/** One recipe as a choice: the row is the button; the sizes and the source show only on the chosen one. */
function RecipeChoiceRow({
  recipe,
  chosen,
  size,
  onChoose,
  onSize,
}: {
  recipe: RecipeRow;
  chosen: boolean;
  size: number | null;
  onChoose: () => void;
  onSize: (value: number) => void;
}) {
  const current = size ?? recipe.choices?.fallback ?? null;
  const title = recipe.choices && current != null ? retitle(recipe, current) : recipe.title;
  return (
    <li>
      <div
        className={`rounded-lg border transition-colors ${chosen ? "border-[color-mix(in_srgb,var(--oa-primary)_55%,transparent)] bg-oa-card" : "border-oa-border bg-oa-card hover:bg-oa-accent"}`}
      >
        <button
          type="button"
          aria-pressed={chosen}
          onClick={onChoose}
          // Where it reads from, on hover (owner rule 4: no source lines).
          title={`From ${recipe.source}`}
          className={`flex w-full cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 text-left ${FOCUS}`}
        >
          <span className={`mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md ${chosen ? "bg-[color-mix(in_srgb,var(--oa-primary)_14%,transparent)] text-oa-primary" : "bg-oa-bg text-oa-muted-fg"}`}>
            <KindIcon name={recipe.icon} className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-[14.5px] font-medium leading-5 text-oa-fg">{title}</span>
              {recipe.standing ? (
                <span className="oa-mono inline-flex h-[20px] items-center rounded border border-oa-border px-1.5 text-[11px] uppercase tracking-[0.04em] text-oa-muted-fg">
                  {recipe.standing.enabled ? "On" : "Paused"}
                </span>
              ) : null}
            </span>
            <span className="mt-0.5 block text-pretty text-[13px] leading-[18px] text-oa-muted-fg">{recipe.line}</span>
          </span>
        </button>
        {chosen && recipe.choices ? (
          <div className="px-3 pb-2.5 pl-[3.25rem]">
            {recipe.choices ? (
              <span className="inline-flex items-center gap-1" role="group" aria-label={recipe.choices.label}>
                {recipe.choices.values.map((choice) => (
                  <button
                    key={choice.value}
                    type="button"
                    aria-pressed={choice.value === current}
                    onClick={() => onSize(choice.value)}
                    className={`oa-mono h-7 cursor-pointer rounded-md border px-2 text-[12.5px] tabular-nums ${FOCUS} ${choice.value === current ? "border-[color-mix(in_srgb,var(--oa-primary)_55%,transparent)] bg-[color-mix(in_srgb,var(--oa-primary)_10%,transparent)] text-oa-primary" : "border-oa-border text-oa-muted-fg hover:text-oa-fg"}`}
                  >
                    {choice.label}
                  </button>
                ))}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

/** "Insiders buy $500K or more" when $500K is picked: the size lives in the title, never in a second line. */
function retitle(recipe: RecipeRow, value: number): string {
  const label = recipe.choices?.values.find((choice) => choice.value === value)?.label;
  const fallback = recipe.choices?.values.find((choice) => choice.value === recipe.choices?.fallback)?.label;
  return label && fallback ? recipe.title.replace(fallback, label) : recipe.title;
}

function Logos({ tickers }: { tickers: string[] }) {
  if (tickers.length === 0) return <span />;
  return (
    <span className="flex shrink-0 -space-x-1.5">
      {tickers.slice(0, 3).map((ticker) => (
        <StockLogo key={ticker} ticker={ticker} size={24} atOnce className="ring-2 ring-oa-card" />
      ))}
    </span>
  );
}

const ROW = "grid grid-cols-[4.75rem_auto_minmax(0,1fr)_auto] items-start gap-x-2.5 px-3 py-2";

/** A day it would have spoken: the row itself opens what it found (the stock, or the filing at the SEC). */
function ReplayRowLink({ href, children }: { href: string | null; children: React.ReactNode }) {
  if (!href) return <div className={ROW}>{children}</div>;
  const outside = /^https?:/.test(href);
  return (
    <Link
      href={href}
      prefetch={false}
      {...(outside ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={`${ROW} transition-colors hover:bg-oa-accent ${FOCUS}`}
    >
      {children}
    </Link>
  );
}

/** The replay: the days it would have spoken, newest first, or what it checked over four quiet weeks. */
const ReplayBlock = React.forwardRef<HTMLElement, {
  replay: RecipeReplay | null;
  loading: boolean;
  error: string | null;
  /** The page's own stock: its logo is in the sheet's head, not on every row. */
  own: string | null;
}>(function ReplayBlock({ replay, loading, error, own }, ref) {  const [all, setAll] = React.useState(false);
  React.useEffect(() => setAll(false), [replay]);
  return (
    <section ref={ref} aria-label="Replay of the last four weeks" className="scroll-mt-3 rounded-lg border border-oa-border bg-oa-card">
      <div className="flex min-h-10 items-center justify-between gap-3 border-b border-oa-border px-3 py-2">
        <h3 className="text-[13.5px] font-semibold text-oa-fg" title={replay?.notes.join(" ") || undefined}>
          {replay && replay.sent.length === 0 ? "Quiet for 4 weeks" : "What it would have sent"}
        </h3>
        {replay ? <span className={`${NUM} text-[12px] text-oa-muted-fg`}>{replay.span}</span> : null}
      </div>
      {loading ? (
        <p className="flex items-center gap-2 px-3 py-4 text-[13.5px] text-oa-muted-fg">
          <Spinner className="size-3.5" /> Replaying the last four weeks…
        </p>
      ) : error ? (
        <p role="alert" className="px-3 py-4 text-[13.5px] text-signal-bearish">
          {error}
        </p>
      ) : replay && replay.sent.length > 0 ? (
        <>
          <ul className="divide-y divide-oa-border">
            {(all ? replay.sent : replay.sent.slice(0, HISTORY_ROWS)).map((row) => (
              <li key={row.day}>
                <ReplayRowLink href={own && row.href === `/stock/${own}` ? null : row.href}>
                <span className={`${NUM} pt-0.5 text-[12px] leading-5 text-oa-muted-fg`}>{row.label}</span>
                <Logos tickers={own && row.tickers.length === 1 && row.tickers[0] === own ? [] : row.tickers} />
                <span className="min-w-0">
                  <span className="block text-pretty text-[13.5px] leading-5 text-oa-fg">{row.headline}</span>
                  {row.detail ? <span className="block text-pretty text-[12.5px] leading-[18px] text-oa-muted-fg">{row.detail}</span> : null}
                </span>
                {row.change_pct != null ? (
                  <span className="text-right leading-[18px]">
                    <span className={`${NUM} block text-[13px] text-oa-fg`}>{money(row.close)}</span>
                    <span className={`${NUM} block text-[12px] ${row.change_pct > 0 ? "text-signal-bullish" : row.change_pct < 0 ? "text-signal-bearish" : "text-oa-muted-fg"}`}>
                      {signed(row.change_pct)}
                    </span>
                  </span>
                ) : (
                  <span />
                )}
                </ReplayRowLink>
              </li>
            ))}
          </ul>
          {replay.sent.length > HISTORY_ROWS && !all ? (
            <button type="button" onClick={() => setAll(true)} className={`w-full cursor-pointer border-t border-oa-border px-3 py-2 text-left text-[13px] font-medium text-oa-muted-fg hover:text-oa-fg ${FOCUS}`}>
              Show {replay.sent.length - HISTORY_ROWS} more
            </button>
          ) : null}
          <p className={`${NUM} border-t border-oa-border px-3 py-1.5 text-[11.5px] text-oa-muted-fg`}>
            {replay.sessions} market days · {replay.quiet} quiet{replay.unchecked ? ` · ${replay.unchecked} not checked` : ""}
          </p>
        </>
      ) : replay ? (
        <p className="px-3 py-2.5 text-[13.5px] leading-5 text-oa-fg" title={replay.checked.join(" · ")}>
          {replay.quietLine}
        </p>
      ) : null}
    </section>
  );
});

export type RecipeSheetProps = {
  /** "stock:NVDA", "fund:berkshire-hathaway", "congress:nancy-pelosi", "basket:<id>". */
  subject: string;
  onClose: () => void;
  /** The context, already known (a dev preview); otherwise read when the sheet opens. */
  initial?: RecipeContext;
  /** A local preview (app/dev/agent-recipes): the button saves nothing. */
  preview?: boolean;
};

type Saved = { jobId: string | null; paused: string | null; existing: boolean };

/**
 * The recipe sheet: the recipes for this page's subject, the chosen one replayed over the last four weeks with only
 * what was known each day, then one button to switch it on. At the plan's limit it says so once and saves it paused.
 */
export function RecipeSheet({ subject, onClose, initial, preview = false }: RecipeSheetProps) {
  const router = useRouter();
  const [context, setContext] = React.useState<Loaded<RecipeContext>>(initial ? { state: "ready", value: initial } : { state: "loading" });
  const [chosen, setChosen] = React.useState<RecipeId | null>(null);
  const [sizes, setSizes] = React.useState<Partial<Record<RecipeId, number>>>({});
  const [replays, setReplays] = React.useState<Record<string, Loaded<RecipeReplay>>>({});
  const [busy, setBusy] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState<Record<string, Saved>>({});
  const panel = React.useRef<HTMLDivElement>(null);
  const replayRef = React.useRef<HTMLElement>(null);
  // A recipe the person picked brings its replay into view (on a phone it sits under the list).
  const picked = React.useRef(false);
  const close = React.useRef(onClose);
  close.current = onClose;

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close.current();
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, []);

  const load = React.useCallback(async () => {
    try {
      const response = await fetch(`/api/agent-recipes?subject=${encodeURIComponent(subject)}`, { cache: "no-store" });
      const body = await readJson<RecipeContext & { ok?: boolean }>(response);
      if (!response.ok || !body.ok) throw new Error(body.error || "We couldn't load the agents for this page.");
      setContext({ state: "ready", value: body });
      return body as RecipeContext;
    } catch (error) {
      setContext({ state: "error", message: error instanceof Error ? error.message : "We couldn't load the agents for this page." });
      return null;
    }
  }, [subject]);

  React.useEffect(() => {
    if (!initial) void load();
  }, [initial, load]);

  const ctx = context.state === "ready" ? context.value : null;
  // The first recipe that is not already on is the one shown first.
  React.useEffect(() => {
    if (ctx && chosen === null) setChosen((ctx.recipes.find((recipe) => !recipe.standing && recipe.ready) ?? ctx.recipes[0])?.id ?? null);
  }, [ctx, chosen]);

  const recipe = ctx?.recipes.find((entry) => entry.id === chosen) ?? null;
  const size = recipe ? sizes[recipe.id] ?? recipe.choices?.fallback ?? null : null;
  const replayKey = recipe ? `${recipe.id}:${size ?? ""}` : "";

  React.useEffect(() => {
    if (!recipe || recipe.id === "lines" || !recipe.ready || replays[replayKey]) return;
    setReplays((old) => ({ ...old, [replayKey]: { state: "loading" } }));
    void (async () => {
      try {
        const response = await fetch("/api/agent-recipes/replay", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ subject, recipe: recipe.id, size }),
        });
        const body = await readJson<{ ok?: boolean; replay?: RecipeReplay }>(response);
        if (!response.ok || !body.replay) throw new Error(body.error || "The replay didn't finish. Try again in a minute.");
        setReplays((old) => ({ ...old, [replayKey]: { state: "ready", value: body.replay! } }));
      } catch (error) {
        setReplays((old) => ({ ...old, [replayKey]: { state: "error", message: error instanceof Error ? error.message : "The replay didn't finish." } }));
      }
    })();
  }, [recipe, replayKey, replays, size, subject]);

  const replay = replays[replayKey];
  React.useEffect(() => {
    if (!picked.current || !replayRef.current) return;
    replayRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [chosen, replay?.state]);
  const done = recipe ? saved[recipe.id] : undefined;
  const atLimit = Boolean(ctx?.signedIn && ctx.limit > 0 && ctx.running >= ctx.limit);
  const pausesForPlan = Boolean(recipe && !recipe.standing && (recipe.proOnly || (recipe.id !== "lines" && atLimit)));
  // A basket's own check is switched on, not saved: at the limit it cannot be, so the button waits (said once below).
  const linesBlocked = Boolean(recipe && recipe.id === "lines" && !recipe.standing && atLimit);

  /** An agent already set up for this, but paused: switch it back on (the plan's limit still applies, server side). */
  async function resume(jobId: string) {
    if (preview) return;
    setBusy(true);
    setSaveError(null);
    try {
      const response = await fetch(`/api/agent-jobs/${encodeURIComponent(jobId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      });
      const body = await readJson<{ ok?: boolean }>(response);
      if (!response.ok) throw new Error(body.error || "That didn't go through. Try again in a minute.");
      setSaved((old) => ({ ...old, [recipe!.id]: { jobId, paused: null, existing: false } }));
      await load();
      router.refresh();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "That didn't go through. Try again in a minute.");
    } finally {
      setBusy(false);
    }
  }
  const basketId = ctx?.subject.kind === "basket" ? ctx.subject.key.slice("basket:".length) : null;

  async function switchOn() {
    if (!recipe || !ctx || preview) return;
    setBusy(true);
    setSaveError(null);
    try {
      if (!ctx.signedIn) {
        await signInWithGoogle({ surface: "header" });
      }
      if (recipe.id === "lines" && basketId) {
        const response = await fetch(`/api/basket-agents/${encodeURIComponent(basketId)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ enabled: true }),
        });
        const body = await readJson<{ ok?: boolean }>(response);
        if (!response.ok || !body.ok) throw new Error(body.error || "That didn't go through. Try again in a minute.");
        setSaved((old) => ({ ...old, [recipe.id]: { jobId: null, paused: null, existing: false } }));
      } else {
        let response: Response | null = null;
        // Right after a sign-in the session cookie can trail the popup by a moment.
        for (let attempt = 0; attempt < 3; attempt += 1) {
          response = await fetch("/api/agent-recipes", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ subject, recipe: recipe.id, size }),
          });
          if (response.status !== 401 || ctx.signedIn) break;
          await new Promise((resolve) => setTimeout(resolve, 1200));
        }
        const body = await readJson<{ ok?: boolean; job?: { id: string }; paused?: string | null; existing?: boolean }>(response!);
        if (!response!.ok || !body.ok || !body.job) throw new Error(body.error || "That didn't go through. Try again in a minute.");
        setSaved((old) => ({ ...old, [recipe.id]: { jobId: body.job!.id, paused: body.paused ?? null, existing: Boolean(body.existing) } }));
      }
      await load();
      router.refresh();
    } catch (error) {
      const code = (error as { code?: unknown })?.code;
      if (typeof code === "string" && /popup-closed|cancelled-popup/.test(code)) return;
      setSaveError(error instanceof Error && !/^Firebase/.test(error.message) ? error.message : "That didn't go through. Try again in a minute.");
    } finally {
      setBusy(false);
    }
  }

  const name = ctx?.subject.name ?? "";
  const title = ctx ? sheetTitle(ctx.subject.kind, name) : "Agents for this page";
  const jobHref = (id: string | null | undefined) => (id ? `/agents/jobs/${encodeURIComponent(id)}` : "/agents");

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center md:items-center md:px-4" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close" tabIndex={-1} className="absolute inset-0 cursor-default bg-black/40" onClick={onClose} />
      <div
        ref={panel}
        tabIndex={-1}
        className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-xl border border-oa-border bg-oa-page shadow-xl outline-none md:max-w-[38rem] md:rounded-xl"
      >
        <div className="flex min-h-12 items-center gap-3 border-b border-oa-border bg-oa-card px-4 py-2">
          {ctx ? <SubjectMark kind={ctx.subject.kind} name={name} /> : null}
          <h2 className="min-w-0 flex-1 text-pretty text-[15.5px] font-semibold leading-5 text-oa-fg">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className={`inline-flex size-9 shrink-0 items-center justify-center rounded text-[18px] leading-none text-oa-muted-fg hover:text-oa-fg ${FOCUS}`}>
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          {context.state === "loading" ? (
            <p className="flex items-center gap-2 py-6 text-[13.5px] text-oa-muted-fg">
              <Spinner className="size-3.5" /> Reading what this page can watch…
            </p>
          ) : context.state === "error" ? (
            <p role="alert" className="py-6 text-[13.5px] text-signal-bearish">
              {context.message}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <ul className="flex flex-col gap-2">
                {ctx!.recipes.map((entry) => (
                  <RecipeChoiceRow
                    key={entry.id}
                    recipe={entry}
                    chosen={entry.id === chosen}
                    size={sizes[entry.id] ?? null}
                    onChoose={() => {
                      setChosen(entry.id);
                      setSaveError(null);
                      picked.current = true;
                    }}
                    onSize={(value) => setSizes((old) => ({ ...old, [entry.id]: value }))}
                  />
                ))}
              </ul>
              {recipe && recipe.id !== "lines" && recipe.ready ? (
                <ReplayBlock
                  ref={replayRef}
                  own={ctx!.subject.kind === "stock" ? ctx!.subject.name : null}
                  replay={replay?.state === "ready" ? replay.value : null}
                  loading={!replay || replay.state === "loading"}
                  error={replay?.state === "error" ? replay.message : null}
                />
              ) : null}
            </div>
          )}
        </div>

        {ctx && recipe ? (
          <div className="flex flex-col gap-2 border-t border-oa-border bg-oa-card px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            {done && !(done.existing && done.paused) ? (
              <p className="text-[13.5px] leading-5 text-oa-fg">
                {done.paused ? done.paused : done.existing ? "That one was already on." : recipe.id === "lines" ? "On. It checks every night after the close." : "On. It checks after each close."}{" "}
                {recipe.id !== "lines" ? (
                  <Link prefetch={false} href={jobHref(done.jobId)} className="font-medium text-oa-primary underline-offset-2 hover:underline">
                    Open its page
                  </Link>
                ) : null}
              </p>
            ) : recipe.standing && recipe.standing.enabled ? (
              <p className="text-[13.5px] leading-5 text-oa-fg">
                Already on: {recipe.standing.label.charAt(0).toLowerCase()}
                {recipe.standing.label.slice(1)}.{" "}
                {recipe.id !== "lines" ? (
                  <Link prefetch={false} href={jobHref(recipe.standing.id)} className="font-medium text-oa-primary underline-offset-2 hover:underline">
                    Open its page
                  </Link>
                ) : null}
              </p>
            ) : recipe.standing || (done && done.existing && done.paused) ? (
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 text-[13.5px] leading-5 text-oa-fg">
                  Already set up, paused.{" "}
                  <Link prefetch={false} href={jobHref(recipe.standing?.id ?? done?.jobId)} className="font-medium text-oa-primary underline-offset-2 hover:underline">
                    Open its page
                  </Link>
                </span>
                <OaButton size="md" loading={busy} onClick={() => void resume((recipe.standing?.id ?? done?.jobId)!)}>
                  Switch it on
                </OaButton>
              </div>
            ) : (
              <>
                {linesBlocked ? (
                  <p className="text-[13px] leading-[18px] text-oa-muted-fg">
                    You run {ctx.running} of {ctx.limit} agents. Pause one to switch this on.{" "}
                    <Link prefetch={false} href="/pricing#agents" className="font-medium text-oa-primary underline-offset-2 hover:underline">
                      See Pro
                    </Link>
                  </p>
                ) : null}
                {pausesForPlan ? (
                  <p className="text-[13px] leading-[18px] text-oa-muted-fg">
                    {recipe.proOnly
                      ? "Watching filings is part of Pro, so this one saves paused."
                      : `You run ${ctx.running} of ${ctx.limit} agents, so this one saves paused.`}{" "}
                    <Link prefetch={false} href="/pricing#agents" className="font-medium text-oa-primary underline-offset-2 hover:underline">
                      See Pro
                    </Link>
                  </p>
                ) : null}
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-[12.5px] text-oa-muted-fg">{recipe.id === "lines" ? "Checks every night" : "Checks after each close"}</span>
                  <OaButton size="md" loading={busy} disabled={!recipe.ready || linesBlocked} onClick={() => void switchOn()}>
                    {!ctx.signedIn ? "Sign in to switch it on" : pausesForPlan ? "Save it paused" : "Switch it on"}
                  </OaButton>
                </div>
              </>
            )}
            {saveError ? (
              <p role="alert" className="text-[13px] text-signal-bearish">
                {saveError}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
