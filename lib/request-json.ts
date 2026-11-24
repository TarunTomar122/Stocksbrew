/**
 * The request body as a plain JSON object, or null when it is not valid JSON or
 * not an object. `await request.json()` happily returns `null`, a number or an
 * array, and a route that then reads `body.field` answers 500 instead of 400
 * (Nov 24: a curl POST of `null` to /api/auth/session).
 */
export async function readJsonObject(request: Pick<Request, "json">): Promise<Record<string, unknown> | null> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return null;
  }
  return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null;
}
