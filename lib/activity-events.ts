export type RadarActivityEvent = {
  title: string;
  body: string;
  sentence: string;
  event_type: string;
  scope: string;
  direction: string;
  symbol: string;
  urgency: number;
  evidence: string[];
};

export function partitionActivityEvents(events: RadarActivityEvent[]) {
  const yourBook = events.filter((e) => {
    const s = (e.scope || "").toLowerCase();
    return s === "portfolio" || s === "stock" || s === "" || Boolean(e.symbol);
  });
  const marketWide = events.filter((e) => !yourBook.includes(e));
  return { yourBook, marketWide };
}
