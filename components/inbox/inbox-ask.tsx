/**
 * The inbox's one Ask: a box for the whole list, so no row carries its own
 * Ask. A plain GET form to /ask; the Ask panel (components/ask/ask-panel-host)
 * catches it and answers beside the page, starting from the person's own
 * stocks (or the example's). No hooks, no client code of its own.
 */
export function InboxAsk({ example }: { example: boolean }) {
  return (
    <form action="/ask" method="get" role="search" aria-label="Ask about your inbox" className="oa-surface flex items-center gap-2 border border-oa-border bg-oa-card px-3 py-2">
      <input type="hidden" name="ctx" value={example ? "ex.portfolio" : "portfolio"} />
      <label htmlFor="inbox-ask" className="sr-only">
        {example ? "Ask about the example's inbox" : "Ask about your inbox"}
      </label>
      <input
        id="inbox-ask"
        name="q"
        type="text"
        autoComplete="off"
        maxLength={300}
        required
        placeholder={example ? "Ask about this inbox" : "Ask about your inbox"}
        className="h-9 min-w-0 flex-1 rounded-md border border-oa-border bg-oa-bg px-3 text-[14px] text-oa-fg outline-none placeholder:text-oa-muted-fg focus:border-[color-mix(in_srgb,var(--ink)_45%,transparent)]"
      />
      <button type="submit" className="h-9 shrink-0 rounded-md bg-oa-primary px-3.5 text-[14px] font-medium text-oa-primary-fg transition-opacity hover:opacity-90">
        Ask
      </button>
    </form>
  );
}
