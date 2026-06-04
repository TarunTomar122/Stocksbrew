"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/auth-context";
import { signInWithGoogle } from "@/lib/sign-in";

type Props = {
  title?: string;
  description?: string;
  /** Up to 3 short, concrete value points shown as a checklist. */
  benefits?: string[];
};

/**
 * The persuasive Pro card. Use directly (normal flow) when the lock IS the
 * content so the container grows with it, or via ProLockOverlay to float it
 * over blurred content.
 */
export function ProLockCard({
  title = "This one needs Pro",
  description = "Get the read, not just the raw numbers.",
  benefits,
}: Props) {
  const { user } = useUser();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleUnlock() {
    if (!user) {
      setBusy(true);
      try {
        await signInWithGoogle();
        router.push("/subscribe");
      } catch (err) {
        console.error("sign-in failed", err);
      } finally {
        setBusy(false);
      }
      return;
    }
    router.push("/subscribe");
  }

  return (
    <div className="flex w-full max-w-[400px] flex-col items-center gap-4 rounded-3xl border border-[#e5e7eb] bg-white p-6 text-center shadow-[0_24px_70px_rgba(17,24,39,0.12)] sm:p-7">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fef3c7] px-2.5 py-1 text-[10px] font-bold tracking-[0.1em] uppercase text-[#92400e]">
        <span aria-hidden>★</span> stocksbrew Pro
      </span>

      <div className="flex flex-col gap-1.5">
        <h3 className="text-[18px] font-semibold leading-snug tracking-[-0.01em] text-[#111111] sm:text-[20px]">
          {title}
        </h3>
        <p className="text-[13px] leading-relaxed text-[#6b7280]">{description}</p>
      </div>

      {benefits && benefits.length > 0 && (
        <ul className="flex w-full flex-col gap-2 text-left">
          {benefits.slice(0, 3).map((b) => (
            <li key={b} className="flex items-start gap-2 text-[13px] text-[#374151]">
              <span
                aria-hidden
                className="material-symbols-outlined mt-0.5 text-[#10b981]"
                style={{ fontSize: 17, fontVariationSettings: "'wght' 600" }}
              >
                check_circle
              </span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={handleUnlock}
        className="inline-flex w-full items-center justify-center gap-1 rounded-full bg-[#111111] px-6 py-3 text-[14px] font-semibold tracking-tight text-white transition-transform hover:-translate-y-[1px] active:translate-y-0 disabled:cursor-wait disabled:opacity-60"
      >
        {busy ? "Signing you in…" : user ? "Start 3 days free" : "Sign in & start free"}
        {!busy && <span aria-hidden>→</span>}
      </button>
      <span className="text-[11px] font-medium text-[#9ca3af]">
        3 days free, then $9/mo. Cancel anytime.
      </span>
    </div>
  );
}

/**
 * Drop this inside any `relative` container that has its own height (real
 * content behind it). Floats the Pro card over blurred content. If the lock is
 * the whole content, render <ProLockCard /> directly so height stays dynamic.
 */
export function ProLockOverlay(props: Props) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center overflow-y-auto rounded-[inherit] bg-white/75 px-4 py-6 backdrop-blur-[7px]">
      <ProLockCard {...props} />
    </div>
  );
}
