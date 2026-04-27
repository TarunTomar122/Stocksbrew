export type AnyRecord = Record<string, unknown>;

export function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as AnyRecord)
    : {};
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function toNumber(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function toText(value: unknown, fallback = "-"): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

export function formatCurrency(value: unknown, currency = "USD"): string {
  const num = toNumber(value, NaN);
  if (!Number.isFinite(num)) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(num);
}

export function formatNumber(value: unknown): string {
  const num = toNumber(value, NaN);
  if (!Number.isFinite(num)) return "-";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(num);
}

export function formatPct(value: unknown): string {
  const num = toNumber(value, NaN);
  if (!Number.isFinite(num)) return "-";
  return `${num >= 0 ? "+" : ""}${num.toFixed(2)}%`;
}

export function formatDateTime(value: unknown): string {
  const raw = String(value ?? "");
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) return "-";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

export function scoreClass(score: unknown): string {
  const value = toNumber(score, 50);
  if (value >= 70) return "tone-positive";
  if (value <= 35) return "tone-negative";
  return "tone-neutral";
}

export function changeClass(changePct: unknown): string {
  const value = toNumber(changePct, 0);
  if (value > 0) return "tone-positive";
  if (value < 0) return "tone-negative";
  return "tone-neutral";
}
