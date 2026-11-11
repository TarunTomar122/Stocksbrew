import * as React from "react";

import { DocsSearch } from "@/components/docs/docs-search";
import { AppPage, FOCUS } from "@/components/oa/kit";
import { SECTIONS, buildQuickIndex, guideHref, guidesIn } from "@/lib/docs";
import Link from "next/link";
import { AppLink } from "@/components/oa/app-link";

/**
 * The docs frame: section nav on the left at lg and up, the page in the
 * middle at reading width, "On this page" on the right when there is room.
 * Below lg the nav folds into a disclosure above the page.
 */

type TocItem = { id: string; text: string };

const REFERENCE_LINKS = [
  { href: "/docs/glossary", label: "Glossary" },
  { href: "/docs/compare", label: "Comparisons" },
  { href: "/developers", label: "API, MCP and CLI" },
];

function NavLink({ href, label, current }: { href: string; label: string; current: string }) {
  const active = current === href;
  return (
    <AppLink
      href={href}
      aria-current={active ? "page" : undefined}
      className={`-ml-px block border-l py-1 pl-3 pr-2 text-[14px] leading-5 transition-colors ${FOCUS} ${
        active ? "border-oa-primary font-medium text-oa-fg" : "border-transparent text-oa-muted-fg hover:border-oa-border hover:text-oa-fg"
      }`}
    >
      {label}
    </AppLink>
  );
}

function SectionNav({ current }: { current: string }) {
  return (
    <nav aria-label="Docs" className="flex flex-col gap-1">
      <Link prefetch={false}
        href="/docs"
        aria-current={current === "/docs" ? "page" : undefined}
        className={`rounded px-1 py-1 text-[14px] ${FOCUS} ${current === "/docs" ? "font-medium text-oa-fg" : "text-oa-muted-fg hover:text-oa-fg"}`}
      >
        All docs
      </Link>
      {SECTIONS.map((section) => {
        const guides = guidesIn(section.id);
        const sectionHref = `/docs/${section.id}`;
        const open = current === sectionHref || guides.some((guide) => guideHref(guide) === current);
        return (
          <details key={section.id} open={open} className="group/sec">
            <summary
              className={`flex cursor-pointer list-none items-center justify-between gap-2 rounded px-1 py-1.5 text-[14px] font-medium text-oa-fg hover:bg-oa-accent [&::-webkit-details-marker]:hidden ${FOCUS}`}
            >
              <span>{section.title}</span>
              <span className="oa-mono text-[12.5px] tabular-nums text-oa-muted-fg">{guides.length}</span>
            </summary>
            <div className="mb-2 ml-1.5 mt-0.5 border-l border-oa-border">
              {guides.map((guide) => (
                <NavLink key={guide.slug} href={guideHref(guide)} label={guide.title} current={current} />
              ))}
            </div>
          </details>
        );
      })}
      <p className="oa-caption mt-3 px-1">Reference</p>
      <div className="ml-1.5 border-l border-oa-border">
        {REFERENCE_LINKS.map((link) => (
          <NavLink key={link.href} href={link.href} label={link.label} current={current} />
        ))}
      </div>
    </nav>
  );
}

export function DocsShell({
  current,
  children,
  toc,
  wide = false,
}: {
  /** The path of the page being shown, to light up the nav. */
  current: string;
  children: React.ReactNode;
  toc?: TocItem[];
  /** Let the page use the full middle column (index and tables), not reading width. */
  wide?: boolean;
}) {
  const quick = buildQuickIndex();
  const hasToc = Boolean(toc && toc.length > 1);
  return (
    <AppPage width="wide" prose>
      <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-x-8 min-[1440px]:grid-cols-[13rem_minmax(0,1fr)_11.5rem]">
        {/* Left: search and the course outline */}
        <aside className="hidden lg:block">
          <div className="sticky top-6 flex max-h-[calc(100vh-3rem)] flex-col gap-3">
            <Link prefetch={false} href="/docs" className={`oa-label rounded ${FOCUS}`}>
              stocksbrew docs
            </Link>
            <DocsSearch quick={quick} />
            <div className="-mr-2 min-h-0 flex-1 overflow-y-auto pb-6 pr-2 [scrollbar-width:thin]">
              <SectionNav current={current} />
            </div>
          </div>
        </aside>

        {/* Below lg: the same two things, folded */}
        <div className="mb-5 flex flex-col gap-2 lg:hidden">
          <DocsSearch quick={quick} />
          <details className="oa-surface border border-oa-border bg-oa-card">
            <summary className={`flex min-h-10 cursor-pointer list-none items-center justify-between px-3 py-2 text-[14px] font-medium text-oa-fg [&::-webkit-details-marker]:hidden ${FOCUS}`}>
              Browse the docs
              <span aria-hidden="true" className="oa-mono text-[12.5px] text-oa-muted-fg">
                +
              </span>
            </summary>
            <div className="border-t border-oa-border px-3 py-2">
              <SectionNav current={current} />
            </div>
          </details>
        </div>

        <div className={`min-w-0 ${wide ? "max-w-[58rem]" : "max-w-[41rem]"}`}>{children}</div>

        {hasToc ? (
          <aside className="hidden min-[1440px]:block">
            <nav aria-label="On this page" className="sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto">
              <p className="oa-caption mb-2">On this page</p>
              <ul className="border-l border-oa-border">
                {toc!.map((item) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className={`-ml-px block border-l border-transparent py-1 pl-3 text-[14px] leading-5 text-oa-muted-fg hover:border-oa-primary hover:text-oa-fg ${FOCUS}`}
                    >
                      {item.text}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>
        ) : null}
      </div>
    </AppPage>
  );
}

/** "On this page" for narrower screens: a folded list at the top of the article. */
export function InlineToc({ toc }: { toc: TocItem[] }) {
  if (toc.length < 2) return null;
  return (
    <details className="oa-surface mb-6 border border-oa-border bg-oa-card min-[1440px]:hidden">
      <summary className={`flex min-h-10 cursor-pointer list-none items-center justify-between px-3 py-2 [&::-webkit-details-marker]:hidden ${FOCUS}`}>
        <span className="oa-caption">On this page</span>
        <span className="oa-mono text-[12.5px] tabular-nums text-oa-muted-fg">{toc.length} sections</span>
      </summary>
      <ol className="border-t border-oa-border px-3 py-2">
        {toc.map((item, index) => (
          <li key={item.id} className="grid grid-cols-[1.5rem_minmax(0,1fr)] py-0.5">
            <span className="oa-mono pt-0.5 text-[12.5px] tabular-nums text-oa-muted-fg">{index + 1}</span>
            <a href={`#${item.id}`} className={`rounded text-[14px] leading-6 text-oa-fg hover:underline ${FOCUS}`}>
              {item.text}
            </a>
          </li>
        ))}
      </ol>
    </details>
  );
}

/** Breadcrumb trail above a docs page title. */
export function Crumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12.5px] leading-4 text-oa-muted-fg">
      {items.map((item, index) => (
        <React.Fragment key={index}>
          {index > 0 ? <span aria-hidden="true">/</span> : null}
          {item.href ? (
            <AppLink href={item.href} className={`rounded underline decoration-oa-border underline-offset-2 hover:text-oa-fg ${FOCUS}`}>
              {item.label}
            </AppLink>
          ) : (
            <span>{item.label}</span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}
