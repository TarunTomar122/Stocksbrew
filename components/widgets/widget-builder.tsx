"use client";

import * as React from "react";

import { StockLogo } from "@/components/stock-logo";
import { DEFAULT_WIDGET_SYMBOL as DEFAULT_SYMBOL, WIDGET_SIZES, widgetPath, widgetSize, widgetSnippet, widgetSymbol, type WidgetSizeId, type WidgetTheme } from "@/lib/embed/stock-widget";

// Local copy: the kit index pulls the server site header into a client bundle.
const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";

const PICKS = ["NVDA", "AAPL", "TSLA", "MSFT", "AMZN", "META"] as const;

/** The preview stage takes the colour of a page the widget would sit on, so the dark card is seen on a dark page. */
const STAGE: Record<WidgetTheme, string> = { light: "#f0eadd", dark: "#12100d" };
const STAGE_INK: Record<WidgetTheme, string> = { light: "#564f44", dark: "#beb5a6" };
const STAGE_LINK: Record<WidgetTheme, string> = { light: "#9a4816", dark: "#d9843f" };

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: ReadonlyArray<{ id: T; label: string }>; onChange: (id: T) => void }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="oa-caption">{label}</span>
      <div role="group" aria-label={label} className="inline-flex h-9 w-fit items-stretch rounded-md border border-oa-border bg-oa-bg p-0.5">
        {options.map((option) => {
          const active = option.id === value;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.id)}
              className={`inline-flex items-center whitespace-nowrap rounded px-3 text-[14px] transition-colors ${FOCUS} ${
                active ? "bg-oa-card font-medium text-oa-fg shadow-[0_0_0_1px_var(--oa-border)]" : "text-oa-muted-fg hover:text-oa-fg"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function WidgetBuilder({
  initialSymbol,
  initialTheme = "light",
  initialSize = "medium",
}: {
  initialSymbol: string;
  initialTheme?: WidgetTheme;
  initialSize?: WidgetSizeId;
}) {
  const [symbol, setSymbol] = React.useState(initialSymbol);
  const [draft, setDraft] = React.useState(initialSymbol);
  const [error, setError] = React.useState<string | null>(null);
  const [theme, setTheme] = React.useState<WidgetTheme>(initialTheme);
  const [sizeId, setSizeId] = React.useState<WidgetSizeId>(initialSize);
  const [copied, setCopied] = React.useState<"idle" | "copied" | "failed">("idle");
  const codeRef = React.useRef<HTMLPreElement>(null);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const size = widgetSize(sizeId);
  const code = widgetSnippet({ symbol, theme, size: sizeId });

  function show(next: string) {
    const clean = widgetSymbol(next);
    if (!clean) {
      setError("That doesn't look like a ticker.");
      return;
    }
    setError(null);
    setDraft(clean);
    setSymbol(clean);
    setCopied("idle");
  }

  // Keep the address in step with the choices, so a copied link opens the same widget. Defaults stay out of it, so
  // the untouched builder keeps the plain /widgets address.
  React.useEffect(() => {
    const query = new URLSearchParams();
    if (symbol !== DEFAULT_SYMBOL) query.set("symbol", symbol);
    if (theme !== "light") query.set("theme", theme);
    if (sizeId !== "medium") query.set("size", sizeId);
    const next = query.toString() ? `/widgets?${query.toString()}` : "/widgets";
    try {
      if (`${window.location.pathname}${window.location.search}` !== next) window.history.replaceState(window.history.state, "", next);
    } catch {
      /* not worth failing over */
    }
  }, [symbol, theme, sizeId]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied("copied");
    } catch {
      // Clipboard refused (an insecure page, a browser setting): select the code so Ctrl+C works.
      const pre = codeRef.current;
      const selection = window.getSelection();
      if (pre && selection) {
        const range = document.createRange();
        range.selectNodeContents(pre);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      setCopied("failed");
    }
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied("idle"), 4000);
  }

  const preview = (
    <section
      aria-label="Preview"
      className="oa-surface flex min-w-0 flex-col items-center justify-center overflow-hidden border border-oa-border p-4"
      style={{ background: STAGE[theme] }}
    >
      <div className="w-full" style={{ maxWidth: typeof size.width === "number" ? size.width : "100%" }}>
        <iframe
          key={`${symbol}-${theme}`}
          src={widgetPath(symbol, theme)}
          width={typeof size.width === "number" ? size.width : "100%"}
          height={size.height}
          title={`${symbol} stock price and our call`}
          className="block w-full border-0"
          style={{ height: size.height }}
        />
        <p className="mt-1 text-[12px] leading-[1.5]" style={{ color: STAGE_INK[theme], fontFamily: "sans-serif" }}>
          <a href={`/stock/${encodeURIComponent(symbol)}`} style={{ color: STAGE_LINK[theme] }} className="underline">
            {symbol} stock price and forecast
          </a>{" "}
          by stocksbrew
        </p>
      </div>
    </section>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <section aria-label="Make your widget" className="oa-surface flex min-w-0 flex-col gap-5 border border-oa-border bg-oa-card p-4 sm:p-5">
          <form
            className="flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              show(draft);
            }}
          >
            <label htmlFor="widget-ticker" className="oa-caption">
              Stock
            </label>
            <div className="flex gap-2">
              <input
                id="widget-ticker"
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value.toUpperCase());
                  if (error) setError(null);
                }}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={16}
                placeholder="Ticker, e.g. NVDA"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "widget-ticker-error" : undefined}
                className="oa-mono h-10 min-w-0 flex-1 rounded-lg border border-oa-border bg-oa-bg px-3 text-[15px] text-oa-fg outline-none placeholder:text-oa-muted-fg focus:border-oa-muted-fg"
              />
              <button
                type="submit"
                className={`inline-flex h-10 shrink-0 items-center rounded-lg border border-oa-border bg-oa-secondary px-4 text-[14px] font-medium text-oa-fg transition-colors hover:border-oa-muted-fg ${FOCUS}`}
              >
                Show
              </button>
            </div>
            {error ? (
              <p id="widget-ticker-error" className="text-[13px] text-[var(--signal-bearish)]">
                {error}
              </p>
            ) : null}
            <div role="group" className="grid grid-cols-3 gap-1.5 pt-1" aria-label="Popular stocks">
              {PICKS.map((pick) => {
                const active = pick === symbol;
                return (
                  <button
                    key={pick}
                    type="button"
                    onClick={() => show(pick)}
                    aria-pressed={active}
                    className={`oa-mono inline-flex h-8 min-w-0 items-center gap-1.5 rounded-full border pl-1 pr-2.5 text-[13px] transition-colors ${FOCUS} ${
                      active ? "border-oa-muted-fg bg-oa-bg font-medium text-oa-fg" : "border-oa-border text-oa-muted-fg hover:text-oa-fg"
                    }`}
                  >
                    <StockLogo ticker={pick} size={22} circle atOnce />
                    {pick}
                  </button>
                );
              })}
            </div>
          </form>

          <div className="flex flex-wrap gap-x-6 gap-y-4">
            <Choice
              label="Theme"
              value={theme}
              options={[
                { id: "light", label: "Light" },
                { id: "dark", label: "Dark" },
              ]}
              onChange={(next) => {
                setTheme(next);
                setCopied("idle");
              }}
            />
            <Choice
              label="Size"
              value={sizeId}
              options={WIDGET_SIZES.map((item) => ({ id: item.id, label: item.label }))}
              onChange={(next) => {
                setSizeId(next);
                setCopied("idle");
              }}
            />
          </div>
        </section>
        {preview}
      </div>

      <section aria-labelledby="widget-code-title" className="oa-surface flex min-w-0 flex-col gap-3 border border-oa-border bg-oa-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h2 id="widget-code-title" className="text-[16px] font-medium text-oa-fg">
            Paste this where the widget goes
          </h2>
          <button
            type="button"
            onClick={() => void copy()}
            className={`inline-flex h-9 shrink-0 items-center rounded-lg bg-oa-primary px-4 text-[14px] font-medium text-oa-primary-fg transition-all hover:brightness-110 ${FOCUS}`}
          >
            <span aria-live="polite">{copied === "copied" ? "Copied" : copied === "failed" ? "Selected: copy it now" : "Copy code"}</span>
          </button>
        </div>
        <pre
          ref={codeRef}
          tabIndex={0}
          className="oa-code min-w-0 whitespace-pre-wrap rounded-lg border border-oa-border bg-oa-bg p-3 text-[12.5px] leading-[1.6] text-oa-fg [overflow-wrap:anywhere]"
        >
          {code}
        </pre>
        <p className="text-[13.5px] leading-5 text-oa-muted-fg">Keep the link, it&apos;s how the widget stays free.</p>
      </section>
    </div>
  );
}
