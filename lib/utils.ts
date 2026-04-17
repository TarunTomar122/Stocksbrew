export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function stripHtml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function truncate(value: string, length: number): string {
  if (value.length <= length) {
    return value;
  }
  return `${value.slice(0, Math.max(0, length - 1)).trim()}…`;
}

export function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

export function coerceIsoDate(value: string | undefined, fallback = new Date(0).toISOString()): string {
  if (!value) {
    return fallback;
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return fallback;
  }
  return new Date(timestamp).toISOString();
}
