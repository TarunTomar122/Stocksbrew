/**
 * The browser's side of the first look: record that a new person's first look starts now (the onboarding's finish),
 * so /agent shows it. One field on their own user doc (app/api/first-look). Safe on the client.
 */

/** Never throws; false when it did not save in time, so the caller can fall back to the one-time preview. */
export async function startFirstLook(source: "onboarding" | "landing", timeoutMs = 2500): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch("/api/first-look", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start", source }),
      signal: controller.signal,
      // The landing's picks move on with a full page load right after: the save must outlive it.
      keepalive: true,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
