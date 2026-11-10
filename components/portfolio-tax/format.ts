/** Formatters shared by the tax view's server and client parts. */

export function money(value: number, digits = 2): string {
  return `$${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/** "+$1,200.00" / "−$300.00"; a value that rounds to zero has no sign. */
export function signedMoney(value: number, digits = 2): string {
  if (Math.abs(value) < 0.5 * 10 ** -digits) return money(0, digits);
  return `${value > 0 ? "+" : "−"}${money(value, digits)}`;
}

export function shares(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

export function gainTone(value: number | null): string {
  if (value === null || Math.abs(value) < 0.005) return "text-oa-fg";
  return value > 0 ? "text-signal-bullish" : "text-signal-bearish";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2025-07-15" -> "Jul 15, 2025", parsed by hand so no timezone shifts the day. Empty for anything else. */
export function day(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
  return match && month ? `${month} ${Number(match[3])}, ${match[1]}` : "";
}
