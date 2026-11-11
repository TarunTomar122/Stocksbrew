/** Server-only LocalDB read helper. Keep this module out of client components. */

import { noteDegradedRender, uncachedFetch } from "@/lib/next-render";

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
    // uncachedFetch: never through Next's Data Cache (see lib/next-render.ts).
    const response = await uncachedFetch(`${baseUrl}/documents/${encodeURIComponent(documentPath)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      if (response.status >= 500) noteDegradedRender();
      return null;
    }

    const payload = (await response.json()) as LocalDBPayload;
    if (!isObject(payload) || !isObject(payload.document) || !isObject(payload.document.data)) {
      return null;
    }
    return payload.document.data as T;
  } catch {
    noteDegradedRender();
    return null;
  }
}
