"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { signInWithGoogle } from "@/lib/sign-in";

/** Signed out: what the tax view does and the one way in. No example numbers. */
export function TaxSignIn() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const points: Array<[string, string]> = [
    [
      "Enter your lots",
      "Buy date, shares and price for each purchase, and each sell. No brokerage login.",
    ],
    [
      "See gains by tax year",
      "Short and long term, matched oldest first or to the lots you pick, with a CSV export.",
    ],
    [
      "Check before you sell",
      "Lots below cost at the latest price, and wash-sale windows around every loss sale.",
    ],
  ];
  return (
    <section className="oa-surface border border-oa-border bg-oa-card">
      <div className="flex flex-col gap-3 px-4 py-6 text-center">
        <p className="text-[15px] font-medium text-oa-fg">
          Keep your tax lots with a free account
        </p>
        <p className="mx-auto max-w-md text-pretty text-[14px] leading-5 text-oa-muted-fg">
          Your lots are saved to your account and only you can see them. US
          federal rules only, not tax advice.
        </p>
        <div>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await signInWithGoogle({ surface: "radar_page" });
                router.refresh();
              } catch {
                // the sign-in sheet reports its own errors
              } finally {
                setBusy(false);
              }
            }}
            className="inline-flex h-10 cursor-pointer items-center rounded border border-oa-primary bg-oa-primary px-4 text-[14px] font-medium text-oa-primary-fg outline-none hover:brightness-110 focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)] disabled:opacity-60 sm:h-9"
          >
            {busy ? "Signing in" : "Start free"}
          </button>
        </div>
      </div>
      <ol className="grid gap-x-8 gap-y-3 border-t border-oa-border px-4 py-4 sm:grid-cols-3">
        {points.map(([title, body], index) => (
          <li key={title} className="flex gap-2.5">
            <span className="oa-mono text-[12.5px] leading-5 text-oa-muted-fg">
              {index + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] font-medium leading-5 text-oa-fg">
                {title}
              </span>
              <span className="mt-0.5 block text-pretty text-[13px] leading-[18px] text-oa-muted-fg">
                {body}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
