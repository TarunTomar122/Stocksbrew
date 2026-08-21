import type { ReactNode } from "react";

import { OaSiteHeader } from "@/components/oa/oa-site-header";

type Props = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  updated?: string;
  children: ReactNode;
};

export function LegalLayout({ eyebrow, title, subtitle, updated, children }: Props) {
  return (
    <main className="oa-landing flex-grow">
      <OaSiteHeader />
      <div className="mx-auto flex w-full max-w-[46rem] flex-col gap-10 px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
        <header className="flex flex-col gap-4">
          {eyebrow && (
            <p className="text-xs uppercase tracking-[0.12em] text-oa-muted-fg">{eyebrow}</p>
          )}
          <h1 className="text-balance font-medium tracking-tight text-oa-fg text-[2.25rem] leading-[1.08] sm:text-[2.75rem] sm:leading-[1.06]">
            {title}
          </h1>
          {subtitle && (
            <p className="max-w-[640px] text-[15px] leading-relaxed text-oa-muted-fg sm:text-base">
              {subtitle}
            </p>
          )}
          {updated && (
            <p className="text-[13px] tabular-nums text-oa-muted-fg">Last updated {updated}</p>
          )}
        </header>

        <article className="legal-prose flex flex-col gap-8 text-[15px] leading-[1.7] text-oa-muted-fg">
          {children}
        </article>
      </div>

      <style>{`
        .legal-prose h2 {
          color: var(--oa-fg);
          font-size: 20px;
          font-weight: 500;
          letter-spacing: -0.01em;
          margin-bottom: 8px;
        }
        .legal-prose p {
          margin: 0;
        }
        .legal-prose ul {
          list-style: disc;
          padding-left: 20px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .legal-prose a {
          color: var(--oa-primary);
          text-decoration: underline;
          text-underline-offset: 4px;
        }
      `}</style>
    </main>
  );
}
