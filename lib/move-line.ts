import { anomalyHeadline } from "@/components/daily-anomalies-shared";
import { usableReplacement } from "@/lib/briefing-groups";
import { asSentence, companyFirstMove, firstFullSentence, hasTitleCaseLeftover, plainFinance, sentenceCase } from "@/lib/plain-copy";

/**
 * Common words a feed capitalises in a headline ("Thacker Pass Cost Increase", "Jefferies Buy Rating"). Only these
 * lose their capital in a sentence that still reads like a headline: a name ("Thacker Pass", "Jefferies") never does,
 * since a lowercased name reads worse than a capital too many.
 */
const COMMON = new Set(
  (
    "cost costs increase increases buy sell hold rating ratings upgrade upgrades downgrade downgrades target targets price prices " +
    "earnings results revenue revenues sales profit profits loss losses guidance outlook forecast forecasts demand supply deal deals " +
    "contract contracts order orders preorders spending rally selloff surge surges plunge plunges jump jumps drop drops gain gains " +
    "rise rises fall falls climb climbs slide slides boost boosts lifts sends sparks drives weighs record growth report reports " +
    "quarter quarterly annual strong weak weaker stronger higher lower better worse expectations estimates update launch approval " +
    "trial data partnership acquisition merger offering split lawsuit probe investigation plan plans rebound decline shares stock " +
    "stocks news concerns fears hopes optimism beat beats miss misses cut cuts raise raises hike hikes"
  ).split(" "),
);

/** "Lithium Americas fell after Thacker Pass Cost Increase." → "… after Thacker Pass cost increase." */
function lowerCommonWords(text: string, companyName: string): string {
  const own = new Set(companyName.toLowerCase().split(/[^a-z0-9'’-]+/).filter(Boolean));
  const words = text.split(/(\s+)/);
  return words
    .map((raw, index) => {
      // The first word starts the sentence; the spaces between words stay as they are.
      if (index === 0 || index % 2 === 1) return raw;
      const bare = raw.replace(/^["“(]+|["”),.;:!?]+$/g, "");
      if (!/^[A-Z][a-z]+$/.test(bare) || own.has(bare.toLowerCase()) || !COMMON.has(bare.toLowerCase())) return raw;
      return raw.replace(bare, bare.toLowerCase());
    })
    .join("");
}

/** The reason as a whole sentence: "CoreWeave raises its forecast as AI demand and capacity strengthen." */
function fullStop(text: string): string {
  const value = text.trim();
  return !value || /[.!?…"”)]$/.test(value) ? value : `${value}.`;
}

/**
 * A move's reason in plain words, company first when the feed wrote the cause first ("Zeta rose after strong
 * earnings"), always ending with a full stop. Market today, the home page and the landing feed all word a move this
 * way, so one stock reads the same on each of them.
 */
export function moveLine(item: { ticker: string; name: string; day_change_pct: number } & Parameters<typeof anomalyHeadline>[0]): string {
  // Feeds write some reasons in Title Case ("GTA VI Preorders Spark Take-Two's Rebound"); read them as a sentence.
  const said = plainFinance(sentenceCase(anomalyHeadline(item), item.name));
  const turned = companyFirstMove(said.replace(/\.$/, ""), item.day_change_pct, { company: { name: item.name, ticker: item.ticker } });
  const line = turned ? `${turned}.` : said;
  if (!hasTitleCaseLeftover(line, item.name)) return fullStop(line);
  // Still a headline ("Take-Two rose after GTA VI Preorders"): the reason's own first sentence says it whole, or else the
  // headline's common words lose their capitals.
  const detail = asSentence(firstFullSentence((item.move_explanation?.why_it_matters ?? "").replace(/\s+/g, " ")));
  return fullStop(usableReplacement(detail, { name: item.name, ticker: item.ticker }) ? detail : lowerCommonWords(line, item.name ?? ""));
}
