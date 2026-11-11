import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth-server";
import { deleteShare } from "@/lib/share/store";
import { isShareId } from "@/lib/share/types";

/** DELETE /api/share/{id}: the person who made a share can take it down. Anyone else gets a 404, so ids cannot be probed. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401, headers: NO_STORE });
  if (!isShareId(params.id)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  const result = await deleteShare(params.id, session.uid).catch(() => null);
  if (result === null) return NextResponse.json({ error: "write_failed" }, { status: 503, headers: NO_STORE });
  if (result !== "deleted") return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
