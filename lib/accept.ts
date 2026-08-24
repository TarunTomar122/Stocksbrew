const PRODUCES = ["text/html", "text/markdown"] as const;

type AcceptEntry = { type: string; q: number; specificity: number; position: number };

function parseAccept(header: string): AcceptEntry[] {
  return header.split(",").map((raw, position) => {
    const parts = raw.trim().split(";").map((part) => part.trim().toLowerCase());
    const type = parts[0] || "*/*";
    let q = 1;
    for (const parameter of parts.slice(1)) {
      const [name, value] = parameter.split("=").map((part) => part.trim());
      if (name === "q") {
        const parsed = Number(value);
        if (!Number.isNaN(parsed)) q = Math.max(0, Math.min(1, parsed));
      }
    }
    const specificity = type === "*/*" ? 0 : type.endsWith("/*") ? 1 : 2;
    return { type, q, specificity, position };
  });
}

function matches(entry: AcceptEntry, candidate: string): boolean {
  if (entry.type === "*/*") return true;
  if (entry.type.endsWith("/*")) return candidate.startsWith(entry.type.slice(0, -1));
  return entry.type === candidate;
}

export function preferredType(header: string | null): (typeof PRODUCES)[number] | null {
  if (!header) return PRODUCES[0];
  const entries = parseAccept(header);
  if (entries.length === 0) return PRODUCES[0];

  let bestType: (typeof PRODUCES)[number] | null = null;
  let bestQ = -1;
  let bestPosition = Infinity;

  for (const candidate of PRODUCES) {
    const matchesForCandidate = entries.filter((entry) => matches(entry, candidate));
    const specificity = Math.max(...matchesForCandidate.map((entry) => entry.specificity), -1);
    const matched = matchesForCandidate
      .filter((entry) => entry.specificity === specificity)
      .sort((a, b) => a.position - b.position)[0];
    if (!matched || matched.q <= 0) continue;
    if (matched.q > bestQ || (matched.q === bestQ && matched.position < bestPosition)) {
      bestType = candidate;
      bestQ = matched.q;
      bestPosition = matched.position;
    }
  }

  return bestType;
}

export function appendVaryAccept(headers: Headers): void {
  const existing = headers.get("Vary");
  if (!existing) {
    headers.set("Vary", "Accept");
    return;
  }
  const tokens = existing.split(",").map((token) => token.trim().toLowerCase());
  if (!tokens.includes("accept")) headers.set("Vary", `${existing}, Accept`);
}
