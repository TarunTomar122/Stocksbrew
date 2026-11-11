import { COPY_HUB_PATH, copyHref, copyIsIndexable, fmtDollars, isFullRecord, period, possessive, type CopyRecord } from "@/lib/copy-trades-shared";
import { pageMetadata } from "@/lib/seo/page-meta";

/**
 * Search titles and descriptions for the copy tests, short enough to show
 * whole in results (titles 50 characters or less where the name allows it,
 * descriptions 155 or less). The pages' own headlines stay as they are.
 */

const TITLE_MAX = 50;
const DESCRIPTION_MAX = 155;

export const COPY_HUB_SEO = {
  title: "Copy trading backtest: 13F funds and Congress",
  description:
    "Every 13F fund and House member we follow, copied from the day each filing went public and ranked against the S&P 500, before costs and taxes.",
};

export function copyHubMetadata() {
  return pageMetadata({
    ...COPY_HUB_SEO,
    path: COPY_HUB_PATH,
    card: ["page", "copy"],
    alt: "How many funds and House members beat the S&P 500 when copied",
    daily: true,
  });
}

export function copySeoTitle(record: CopyRecord): string {
  const moves = record.kind === "fund" ? "13F moves" : "trades";
  const ask = `What if you copied ${possessive(record.name)} ${moves}?`;
  return ask.length <= TITLE_MAX ? ask : `${record.name}: copy-trade backtest`;
}

export function copySeoDescription(record: CopyRecord): string {
  const what = record.kind === "fund" ? "13F filings" : "reported trades";
  if (!isFullRecord(record)) return `${possessive(record.name)} ${what}, tested as a copy portfolio against the S&P 500. There is not enough of a record to test yet.`;
  // "from Feb 2020", or "from Mar 2023 until Dec 2024" for a record that ended.
  const result = `$10,000 copying ${possessive(record.name)} ${what} ${period(record)} became ${fmtDollars(record.copy.end_value)}, against ${fmtDollars(record.spy.end_value)} in the S&P 500.`;
  const more = `${result} Each year's return, the worst fall and the best moves.`;
  return more.length <= DESCRIPTION_MAX ? more : result;
}

export function copyRecordMetadata(record: CopyRecord) {
  const path = copyHref(record.slug);
  return pageMetadata({
    title: copySeoTitle(record),
    description: copySeoDescription(record),
    path,
    card: ["copy", record.slug],
    alt: `${record.name}: $10,000 copied against the S&P 500`,
    daily: true,
    noindex: !copyIsIndexable(record),
  });
}
