"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Invisible client component that polls router.refresh() every 5s so the
 * BuildingState screen auto-advances once the radar view is ready.
 */
export function BuildingStateRefresher() {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => {
      router.refresh();
    }, 5000);
    return () => clearInterval(id);
  }, [router]);

  return (
    <p className="text-[12px] text-[#9ca3af]">
      Checking automatically — no need to refresh.
    </p>
  );
}
