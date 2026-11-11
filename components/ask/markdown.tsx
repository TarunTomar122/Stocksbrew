"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AppLink } from "@/components/oa/app-link";

const SIZES = {
  /** The short answer at the top of an answer: a touch larger, so it reads first. */
  lead: "text-[16px] leading-[1.55]",
  body: "text-[15px] leading-[1.6]",
} as const;

/** The copilot's prose. Markdown in, brew typography out. Links open in a new tab unless they stay on the site. */
export function AskMarkdown({ text, size = "body" }: { text: string; size?: keyof typeof SIZES }) {
  return (
    <div className={`min-w-0 text-oa-fg ${SIZES[size]}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-2.5 text-pretty last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="mb-2.5 list-disc space-y-1 pl-5 marker:text-oa-muted-fg last:mb-0">{children}</ul>,
          ol: ({ children }) => <ol className="mb-2.5 list-decimal space-y-1 pl-5 marker:text-oa-muted-fg last:mb-0">{children}</ol>,
          li: ({ children }) => <li className="text-pretty pl-0.5">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-oa-fg">{children}</strong>,
          h1: ({ children }) => <p className="mb-1.5 mt-3 text-[15px] font-semibold first:mt-0">{children}</p>,
          h2: ({ children }) => <p className="mb-1.5 mt-3 text-[15px] font-semibold first:mt-0">{children}</p>,
          h3: ({ children }) => <p className="mb-1.5 mt-3 text-[15px] font-semibold first:mt-0">{children}</p>,
          a: ({ href, children }) => {
            const internal = typeof href === "string" && href.startsWith("/");
            return (
              <AppLink href={href} {...(internal ? {} : { target: "_blank", rel: "noopener noreferrer" })} className="underline decoration-oa-border underline-offset-2 hover:decoration-oa-fg">
                {children}
              </AppLink>
            );
          },
          code: ({ children }) => <code className="oa-mono rounded bg-oa-bg px-1 py-0.5 text-[13px]">{children}</code>,
          table: ({ children }) => (
            <div className="mb-2.5 overflow-x-auto">
              <table className="w-full border-collapse text-[13.5px]">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border-b border-oa-border px-2 py-1.5 text-left font-medium text-oa-muted-fg">{children}</th>,
          td: ({ children }) => <td className="border-b border-oa-border px-2 py-1.5 align-top">{children}</td>,
          blockquote: ({ children }) => <blockquote className="mb-2.5 border-l-2 border-oa-border pl-3 text-oa-muted-fg">{children}</blockquote>,
          hr: () => <hr className="my-3 border-oa-border" />,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
