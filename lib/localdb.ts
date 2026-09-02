/** Server-only LocalDB read helper. Keep this module out of client components. */

type LocalDBPayload = {
  document?: {
    data?: unknown;
  };
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function getLocalDBDocument<T = Record<string, unknown>>(
  documentPath: string,
): Promise<T | null> {
  const baseUrl = process.env.LOCALDB_URL?.trim().replace(/\/+$/, "");
  const token = process.env.LOCALDB_API_TOKEN?.trim();
  if (!baseUrl || !token) return null;

  try {
    const response = await fetch(`${baseUrl}/documents/${encodeURIComponent(documentPath)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as LocalDBPayload;
    if (!isObject(payload) || !isObject(payload.document) || !isObject(payload.document.data)) {
      return null;
    }
    return payload.document.data as T;
  } catch {
    return null;
  }
}
