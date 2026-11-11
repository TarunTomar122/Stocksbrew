import * as React from "react";
import { AppLink } from "@/components/oa/app-link";

const LINK =
  "font-medium text-oa-fg underline decoration-[color-mix(in_srgb,var(--oa-primary)_55%,transparent)] decoration-1 underline-offset-[3px] hover:decoration-oa-primary outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)] rounded-sm";

const TOKEN = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;

/**
 * Render the three inline marks the docs content uses: [label](href),
 * **bold** and `code`. Bold may contain code or a link; nothing nests deeper.
 */
export function Inline({ text }: { text: string }): React.ReactElement {
  return <>{renderInline(text)}</>;
}

export function renderInline(text: string, keyPrefix = "i"): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let index = 0;
  for (const match of text.matchAll(TOKEN)) {
    const start = match.index ?? 0;
    if (start > last) out.push(text.slice(last, start));
    const key = `${keyPrefix}${index++}`;
    if (match[1] != null && match[2] != null) {
      const href = match[2];
      const external = /^https?:\/\//.test(href);
      out.push(
        <AppLink key={key} href={href} className={LINK} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
          {match[1]}
        </AppLink>,
      );
    } else if (match[3] != null) {
      out.push(
        <strong key={key} className="font-semibold text-oa-fg">
          {renderInline(match[3], `${key}-`)}
        </strong>,
      );
    } else if (match[4] != null) {
      out.push(
        <code key={key} className="oa-mono rounded bg-oa-bg px-1 py-px text-[0.9em] text-oa-fg">
          {match[4]}
        </code>,
      );
    }
    last = start + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
