import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-revalidate-token") || "";
  const expected = process.env.REVALIDATE_TOKEN || "";
  if (!expected || token !== expected) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  revalidatePath("/", "layout");
  revalidatePath("/stock/[symbol]", "page");
  revalidatePath("/watchlist", "page");

  return NextResponse.json({ ok: true });
}

