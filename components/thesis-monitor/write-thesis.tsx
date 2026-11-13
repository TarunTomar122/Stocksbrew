"use client";

import { useRouter } from "next/navigation";

import { OaButton } from "@/components/oa/button";

/** My stocks' header action: start a thesis over the holdings (shown only to someone with two or more). */
export function WriteThesisButton() {
  const router = useRouter();
  return (
    <OaButton size="sm" variant="secondary" onClick={() => router.push("/agents/theses/new")}>
      Write a thesis
    </OaButton>
  );
}
