import type { ReactNode } from "react";

type Props = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  updated?: string;
  children: ReactNode;
};

export function LegalLayout({ eyebrow, title, subtitle, updated, children }: Props) {
  return (
    <main className="flex-grow">
      <div className="mx-auto w-full max-w-[800px] px-6 md:px-10 lg:px-16 py-12 md:py-20 flex flex-col gap-10">
        <header className="flex flex-col gap-4">
          {eyebrow && (
            <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-on-surface-variant">
              {eyebrow}
            </span>
          )}
          <h1 className="text-[36px] md:text-[44px] font-semibold tracking-[-0.03em] text-on-surface leading-[1.1]">
            {title}
          </h1>
          {subtitle && (
            <p className="text-[16px] text-on-surface-variant leading-[1.55] max-w-[640px]">
              {subtitle}
            </p>
          )}
          {updated && (
            <span className="text-[13px] text-on-surface-variant">Last updated {updated}</span>
          )}
        </header>

        <article className="legal-prose flex flex-col gap-8 text-[15px] text-on-surface-variant leading-[1.7]">
          {children}
        </article>
      </div>

      <style>{`
        .legal-prose h2 {
          color: var(--on-surface);
          font-size: 22px;
          font-weight: 600;
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
          color: var(--primary);
          text-decoration: underline;
          text-underline-offset: 2px;
        }
      `}</style>
    </main>
  );
}
