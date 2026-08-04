"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function OnDemandResearchRefresh({ status }: { status?: string | null }) {
  const router = useRouter();
  const normalized = String(status || "").toLowerCase();
  const active = ["queued", "running", "retry"].includes(normalized);

  useEffect(() => {
    if (!active) return undefined;
    const interval = window.setInterval(() => router.refresh(), 20_000);
    return () => window.clearInterval(interval);
  }, [active, router]);

  return null;
}
