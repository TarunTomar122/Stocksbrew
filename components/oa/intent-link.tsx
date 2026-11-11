"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PrefetchKind } from "next/dist/client/components/router-reducer/router-reducer-types";
import type { ComponentProps, FocusEvent, MouseEvent, TouchEvent } from "react";

type IntentLinkProps = Omit<ComponentProps<typeof Link>, "prefetch" | "href"> & { href: string };

/**
 * A nav link that fetches its page's shell only when someone shows intent
 * (hover, keyboard focus or a touch), not as soon as it scrolls into view.
 * The sidebar, tab bar and footer hold about fifteen links on every page;
 * prefetching them all on load was fifteen requests nobody asked for.
 */
export function IntentLink({ href, onMouseEnter, onFocus, onTouchStart, ...rest }: IntentLinkProps) {
  const router = useRouter();
  // AUTO: the shell down to the page's loading state, the same thing a default <Link> fetches in view.
  const warm = () => router.prefetch(href, { kind: PrefetchKind.AUTO });
  return (
    <Link
      prefetch={false}
      href={href}
      onMouseEnter={(event: MouseEvent<HTMLAnchorElement>) => {
        onMouseEnter?.(event);
        warm();
      }}
      onFocus={(event: FocusEvent<HTMLAnchorElement>) => {
        onFocus?.(event);
        warm();
      }}
      onTouchStart={(event: TouchEvent<HTMLAnchorElement>) => {
        onTouchStart?.(event);
        warm();
      }}
      {...rest}
    />
  );
}
