/**
 * Scraped headlines in plain sentence case for the briefing's cards and the market desk (owner rule 8: no Scraped
 * Title Case). Pure: no React, so it is tested on its own.
 */
import { hasTitleCaseLeftover, headlineCase, isBrandWord } from "@/lib/plain-copy";

const DAY_OR_MONTH = /^(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day$|^(?:January|February|March|April|May|June|July|August|September|October|November|December)$/;

/**
 * A headline in sentence case. It goes through `headlineCase` first: a whole Title Case headline through
 * `sentenceCase`, then stray capitals in a mixed one ("QQQ Holders Feel it even If they Never trade") through
 * `mixedCase`; both lower only common words, so names like Anthropic stay, and `names` (the other companies on the
 * page) keep theirs too. A leftover run ("Take-Two rose after GTA VI Preorders.") then loses the capital on the run's
 * last word only: acronyms, inner capitals, days, months, brands and the company's own name stay as written.
 */
const COMMON_ENDING = /(?:[^s]s|ing|ed|tion|sion|ment|ness|ity|ers)$/;

export function unTitle(input: string, companyName = "", names: readonly string[] = []): string {
  const text = headlineCase(input, companyName, names);
  if (!hasTitleCaseLeftover(text, companyName)) return text;
  const own = new Set([companyName, ...names].join(" ").toLowerCase().split(/[^a-z0-9'’-]+/).filter(Boolean));
  const words = text.split(/(\s+)/);
  const out = [...words];
  const positions = words.map((_, index) => index).filter((index) => index % 2 === 0 && words[index]);
  let run: number[] = [];
  // A run's last capitalised word loses its capital only when it reads like a common word ("Preorders", "Earnings",
  // "Rising"), never when it could be a name ("Jensen Huang"): a lowercased surname reads worse than one capital too many.
  const flush = () => {
    const last = run[run.length - 1];
    if (run.length >= 2 && last != null) {
      const raw = words[last]!;
      const bare = raw.replace(/^["“(]+|["”),.;:!?]+$/g, "");
      if (/^[A-Z][a-z’'-]{3,}$/.test(bare) && COMMON_ENDING.test(bare) && !own.has(bare.toLowerCase()) && !DAY_OR_MONTH.test(bare) && !isBrandWord(bare)) {
        out[last] = raw.replace(bare, bare.toLowerCase());
      }
    }
    run = [];
  };
  positions.forEach((index, order) => {
    if (order === 0) return;
    const raw = words[index]!;
    const bare = raw.replace(/^["“(]+|["”),.;:!?]+$/g, "");
    const previous = words[positions[order - 1]!] ?? "";
    if (!/^[A-Z]/.test(bare) || /[.!?:]$/.test(previous)) return flush();
    // Common words elsewhere in the run were already lowered by headlineCase, which knows when a run is a name
    // ("The Trade Desk", "Best Buy"); this pass only looks at the run's last word.
    run.push(index);
    if (/[,.;:!?)]$/.test(raw)) flush();
  });
  flush();
  return out.join("");
}
