/**
 * Which links the Ask panel takes over (components/ask/ask-panel-host.tsx). Its own file with no imports, because
 * the host loads with every page and must not pull lib/ask-context.ts in with it.
 *
 * An /ask address the panel can take instead of the page: a question (`q`), an item (`ctx`) or both, on this site.
 * Null for anything else, including a saved conversation (`c`), which only the page can open.
 */
export function askLinkTarget(url: URL, origin: string): { question: string | null; context: string | null } | null {
  if (url.origin !== origin || url.pathname !== "/ask" || url.searchParams.has("c")) return null;
  const question = url.searchParams.get("q")?.trim() || null;
  const context = url.searchParams.get("ctx")?.trim() || null;
  return question || context ? { question, context } : null;
}

/** The panel's element id: the Ask buttons' aria-controls, and how the host and panel recognise their own nodes. */
export const ASK_PANEL_ID = "ask-panel";
