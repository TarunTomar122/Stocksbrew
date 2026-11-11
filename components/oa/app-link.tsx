import Link from "next/link";
import type { AnchorHTMLAttributes } from "react";

import { isInternalHref } from "@/lib/internal-href";

type AppLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href?: string | null };

/**
 * An <a> whose href is only known at runtime. App pages open with a
 * client-side navigation (no full reload, no prefetch until the click);
 * other sites, hashes, files, downloads and new-tab links stay a plain <a>.
 * The rendered element is the same <a> either way.
 */
export function AppLink({ href, ...rest }: AppLinkProps) {
  if (isInternalHref(href) && !rest.download && !rest.target) return <Link prefetch={false} href={href} {...rest} />;
  return <a href={href ?? undefined} {...rest} />;
}
