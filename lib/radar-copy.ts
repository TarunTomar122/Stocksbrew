import type { RadarBookStats, RadarPillarScores, RadarSectorCluster } from "@/lib/radar-hub-data";

/** Backend / LLM portfolio copy we should not show verbatim. */
export function isAiSummary(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  return (
    isPulseStatsLine(t) ||
    /largest cluster|average stocksbrew|stocksbrew score|risk flags? need review|analyst runway|need review|watch list names have/i.test(
      t,
    )
  );
}

export function isPulseStatsLine(text: string): boolean {
  return /alerts?\s+active|avg overall score|\d+\s+up,\s*\d+\s+down/i.test(text);
}

export function isGenericMoveLine(text: string): boolean {
  return /moved\s[+-]?\d+(\.\d+)?%\s+today/i.test(text.trim());
}

export function stanceVerb(stance: string): string {
  switch (stance.toLowerCase()) {
    case "accumulate":
      return "Add";
    case "trim":
      return "Trim";
    case "avoid":
      return "Exit";
    case "watch":
      return "Watch";
    case "hold":
      return "Hold";
    default:
      return stance.charAt(0).toUpperCase() + stance.slice(1);
  }
}

export function stanceHint(stance: string): string {
  switch (stance.toLowerCase()) {
    case "accumulate":
      return "Setup looks good to add";
    case "trim":
      return "Consider taking some off";
    case "avoid":
      return "Structure broken — step aside";
    case "watch":
      return "Wait for a better entry";
    case "hold":
      return "No change needed";
    default:
      return "";
  }
}

/** Turn terse rebalance notes into a short human line. */
export function humanizeRebalanceNote(note: string): string {
  let clean = note
    .replace(/\s*\/\s*/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "";
  const sentence = clean.split(/(?<=[.!?])\s+/)[0] ?? clean;
  if (sentence.length > 88) {
    const head = sentence.slice(0, 87);
    const cut = head.lastIndexOf(" ");
    return `${(cut > 40 ? head.slice(0, cut) : head).trim()}…`;
  }
  return sentence;
}

export function humanizeDirectiveLine(text: string): string {
  const clean = text.trim();
  if (!clean) return "";
  if (/^watch\b/i.test(clean) && clean.length < 24) return "Waiting for a clearer setup";
  if (/^accumulate\b/i.test(clean) && clean.length < 24) return "Good spot to add on strength";
  if (/^trim\b/i.test(clean) && clean.length < 20) return "Extended — lighten up";
  return clean;
}

/** Boilerplate directive / rebalance copy — hide when zone label already says the action. */
export function isGenericActionLine(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  return (
    t === "Good spot to add on strength" ||
    t === "Waiting for a clearer setup" ||
    t === "Extended — lighten up" ||
    /^hold near current size/i.test(t) ||
    /^keep small\.?$/i.test(t) ||
    /^increase modestly on weakness/i.test(t) ||
    /^no change needed/i.test(t)
  );
}

export function buildBookRead(input: {
  stats: RadarBookStats;
  pillars: RadarPillarScores;
  clusters: RadarSectorCluster[];
  bookChangePct: number | null;
}): string {
  const { stats, pillars, clusters, bookChangePct } = input;
  const parts: string[] = [];

  if (typeof bookChangePct === "number" && Number.isFinite(bookChangePct)) {
    const dir = bookChangePct >= 0 ? "up" : "down";
    parts.push(`Your book is ${dir} ${Math.abs(bookChangePct).toFixed(1)}% today.`);
  }

  const top = clusters[0];
  if (top && top.weightPct >= 45) {
    parts.push(`${Math.round(top.weightPct)}% sits in ${top.sector} — that's a lot in one sector.`);
  }

  if (stats.flaggedCount > 0) {
    parts.push(
      `${stats.flaggedCount} ${stats.flaggedCount === 1 ? "stock has" : "stocks have"} an active call.`,
    );
  } else if (stats.laggard && Math.abs(stats.laggard.changePct) >= 4) {
    parts.push(`${stats.laggard.ticker} is the main drag (${stats.laggard.changePct.toFixed(1)}%).`);
  } else if (stats.leader && stats.leader.changePct >= 4) {
    parts.push(`${stats.leader.ticker} is the strongest mover (+${stats.leader.changePct.toFixed(1)}%).`);
  }

  if (pillars.overall !== null && parts.length < 2) {
    if (pillars.overall >= 75) parts.push("Scores look strong across the book.");
    else if (pillars.overall < 55) parts.push("A few names are pulling the average down.");
  }

  return parts.slice(0, 2).join(" ");
}
