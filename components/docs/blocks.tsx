import * as React from "react";

import { CodeBlock } from "@/components/docs/copy-button";
import { Inline } from "@/components/docs/inline";
import type { Block } from "@/lib/docs/types";
import { FEATURES, FEATURE_GROUPS, describeRule, listedFeatureIds, type Feature } from "@/lib/entitlements";

/**
 * Renders a guide's blocks. One vertical rhythm for the whole course: body
 * text at 16px on a 28px line, headings that anchor, tables that scroll
 * sideways on a phone instead of squeezing.
 */

const BODY = "text-pretty text-[16px] leading-7 text-oa-fg/90";

export function DocBlocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="flex flex-col gap-4">
      {blocks.map((block, index) => (
        <DocBlock key={index} block={block} />
      ))}
    </div>
  );
}

function DocBlock({ block }: { block: Block }) {
  switch (block.t) {
    case "p":
      return (
        <p className={BODY}>
          <Inline text={block.text} />
        </p>
      );
    case "h2":
      return (
        <h2
          id={block.id}
          className="group mt-6 scroll-mt-24 border-t border-oa-border pt-6 text-[21px] font-medium leading-7 tracking-tight text-oa-fg first:mt-0 first:border-t-0 first:pt-0"
        >
          <a href={`#${block.id}`} className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]">
            <Inline text={block.text} />
            <span aria-hidden="true" className="oa-mono ml-2 text-[14px] text-oa-muted-fg opacity-0 transition-opacity group-hover:opacity-100">
              #
            </span>
          </a>
        </h2>
      );
    case "h3":
      return (
        <h3 className="mt-2 text-[17px] font-medium leading-6 text-oa-fg">
          <Inline text={block.text} />
        </h3>
      );
    case "ul":
      return (
        <ul className="flex flex-col gap-2">
          {block.items.map((item, index) => (
            <li key={index} className={`relative pl-5 ${BODY}`}>
              <span aria-hidden="true" className="absolute left-0 top-[12px] h-[5px] w-[5px] rounded-full bg-oa-primary" />
              <Inline text={item} />
            </li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol className="flex flex-col gap-2">
          {block.items.map((item, index) => (
            <li key={index} className={`grid grid-cols-[1.75rem_minmax(0,1fr)] ${BODY}`}>
              <span className="oa-mono pt-px text-[14px] tabular-nums text-oa-muted-fg">{index + 1}.</span>
              <span>
                <Inline text={item} />
              </span>
            </li>
          ))}
        </ol>
      );
    case "note": {
      const warn = block.tone === "warn";
      return (
        <aside
          className={`oa-surface border bg-oa-card px-4 py-3 ${
            warn ? "border-[color-mix(in_srgb,var(--oa-primary)_45%,transparent)]" : "border-oa-border"
          }`}
        >
          <p className="oa-caption mb-1">{block.title ?? (warn ? "Careful" : "Note")}</p>
          <p className="text-pretty text-[15px] leading-6 text-oa-fg/90">
            <Inline text={block.text} />
          </p>
        </aside>
      );
    }
    case "table":
      return (
        <figure className="min-w-0">
          <div className="oa-surface overflow-x-auto border border-oa-border bg-oa-card">
            <table className="w-full border-collapse text-left text-[14.5px] leading-6">
              <thead>
                <tr>
                  {block.head.map((cell, index) => (
                    <th key={index} scope="col" className="oa-caption whitespace-nowrap border-b border-oa-border bg-oa-bg px-3 py-2 first:pl-4 last:pr-4">
                      {cell}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b border-oa-border last:border-b-0">
                    {row.map((cell, cellIndex) => (
                      <td
                        key={cellIndex}
                        className={`min-w-[7rem] px-3 py-2 align-top first:pl-4 last:pr-4 ${
                          cellIndex === 0 ? "font-medium text-oa-fg" : "text-oa-fg/85"
                        }`}
                      >
                        <Inline text={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {block.caption ? (
            <figcaption className="mt-1.5 text-[13px] leading-5 text-oa-muted-fg">
              <Inline text={block.caption} />
            </figcaption>
          ) : null}
        </figure>
      );
    case "steps":
      return (
        <ol className="oa-surface border border-oa-border bg-oa-card">
          {block.items.map((item, index) => (
            <li key={index} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-1 border-b border-oa-border px-4 py-3 last:border-b-0">
              <span className="oa-mono pt-0.5 text-[14px] tabular-nums text-oa-muted-fg">{String(index + 1).padStart(2, "0")}</span>
              <div className="min-w-0">
                <p className="text-[15.5px] font-medium leading-6 text-oa-fg">
                  <Inline text={item.title} />
                </p>
                <p className="mt-0.5 text-pretty text-[15px] leading-6 text-oa-fg/85">
                  <Inline text={item.text} />
                </p>
              </div>
            </li>
          ))}
        </ol>
      );
    case "formula":
      return (
        <figure className="oa-surface border border-oa-border bg-oa-bg px-4 py-3">
          <p className="oa-mono overflow-x-auto whitespace-nowrap text-[14px] leading-6 text-oa-fg">{block.text}</p>
          {block.caption ? (
            <figcaption className="mt-1 text-[13.5px] leading-5 text-oa-muted-fg">
              <Inline text={block.caption} />
            </figcaption>
          ) : null}
        </figure>
      );
    case "example":
      return (
        <figure className="oa-surface border border-oa-border bg-oa-card">
          <figcaption className="oa-caption border-b border-oa-border px-4 py-2">{block.title}</figcaption>
          <ol className="px-4 py-2.5">
            {block.lines.map((line, index) => (
              <li key={index} className="oa-mono py-0.5 text-[13.5px] leading-6 text-oa-fg/90">
                <Inline text={line} />
              </li>
            ))}
          </ol>
        </figure>
      );
    case "defs":
      return (
        <dl className="oa-surface border border-oa-border bg-oa-card">
          {block.items.map((item, index) => (
            <div key={index} className="grid gap-x-4 gap-y-0.5 border-b border-oa-border px-4 py-2.5 last:border-b-0 sm:grid-cols-[11rem_minmax(0,1fr)]">
              <dt className="text-[15px] font-medium leading-6 text-oa-fg">
                <Inline text={item.term} />
              </dt>
              <dd className="text-pretty text-[15px] leading-6 text-oa-fg/85">
                <Inline text={item.text} />
              </dd>
            </div>
          ))}
        </dl>
      );
    case "code":
      return <CodeBlock code={block.code} label={block.label} />;
    case "entitlements":
      return <EntitlementsTable />;
  }
}

/** Free vs Pro, straight from the table the gates read. */
function EntitlementsTable() {
  const features = listedFeatureIds().map((id) => FEATURES[id] as Feature);
  return (
    <div className="oa-surface overflow-x-auto border border-oa-border bg-oa-card">
      <table className="w-full table-fixed border-collapse text-left text-[14.5px] leading-6">
        <thead>
          <tr>
            <th scope="col" className="oa-caption border-b border-oa-border bg-oa-bg px-3 py-2 pl-4">
              What
            </th>
            <th scope="col" className="oa-caption w-[5.75rem] border-b border-oa-border bg-oa-bg px-2 py-2 sm:w-[9.5rem] sm:px-3">
              Free
            </th>
            <th scope="col" className="oa-caption w-[5.75rem] border-b border-oa-border bg-oa-bg px-2 py-2 pr-3 sm:w-[9.5rem] sm:px-3 sm:pr-4">
              Pro
            </th>
          </tr>
        </thead>
        {FEATURE_GROUPS.map((group) => {
          const rows = features.filter((feature) => feature.group === group);
          if (rows.length === 0) return null;
          return (
            <tbody key={group}>
              <tr>
                <th scope="colgroup" colSpan={3} className="border-b border-oa-border px-4 pb-1.5 pt-4 text-left text-[13px] font-medium text-oa-muted-fg">
                  {group}
                </th>
              </tr>
              {rows.map((feature) => (
                <tr key={feature.name} className="border-b border-oa-border last:border-b-0">
                  <td className="px-3 py-2 pl-4 align-top text-oa-fg">{feature.name}</td>
                  <td className={`oa-mono px-2 py-2 align-top text-[12.5px] sm:px-3 sm:text-[14px] ${feature.free.kind === "locked" ? "text-oa-muted-fg" : "text-oa-fg"}`}>
                    {describeRule(feature.free)}
                  </td>
                  <td className="oa-mono px-2 py-2 pr-3 align-top text-[12.5px] text-oa-fg sm:px-3 sm:pr-4 sm:text-[14px]">{describeRule(feature.pro)}</td>
                </tr>
              ))}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}
