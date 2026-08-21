"use client";

import Link from "next/link";

import { useUser } from "@/lib/auth-context";

/** The OA header's profile control: a quiet circular avatar that links to
 * /profile. Photo when Google provides one, initial otherwise. Renders a
 * neutral placeholder while the client auth context resolves, so the pill
 * never flashes between states. */
export function OaProfileButton() {
  const { user, loading, initialAuthed } = useUser();

  if (!user && (loading || initialAuthed)) {
    return <div aria-hidden="true" className="size-8 animate-pulse rounded-full bg-oa-secondary" />;
  }

  if (!user) return null;

  return (
    <Link
      href="/profile"
      title={user.displayName || user.email || "Profile"}
      className="flex size-8 items-center justify-center overflow-hidden rounded-full outline-none ring-2 ring-transparent transition-all hover:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]"
    >
      {user.photoURL ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.photoURL} alt="" className="size-8 object-cover" />
      ) : (
        <span className="flex size-8 items-center justify-center bg-oa-primary text-sm font-medium text-oa-primary-fg">
          {(user.displayName || user.email || "?").trim().charAt(0).toUpperCase()}
        </span>
      )}
    </Link>
  );
}
