"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type ChatMarkdownProps = {
  content: string;
  variant?: "assistant" | "user";
};

/** Break inline " - bullet - bullet" walls into real list lines */
function normalizeChatMarkdown(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return trimmed;
  const newlineCount = (trimmed.match(/\n/g) ?? []).length;
  if (newlineCount >= 3) return trimmed;
  if (!trimmed.includes(" - ")) return trimmed;
  return trimmed.replace(/\s+-\s+/g, "\n- ").replace(/^- /, "- ");
}

export function ChatMarkdown({ content, variant = "assistant" }: ChatMarkdownProps) {
  const isUser = variant === "user";
  const markdown = normalizeChatMarkdown(content);

  return (
    <div
      className={
        isUser
          ? "text-[14px] leading-snug text-white [&_strong]:text-white"
          : "chat-md text-[14px] leading-relaxed text-[#111111]"
      }
    >
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => (
          <p className={`last:mb-0 ${isUser ? "mb-0" : "mb-2.5"}`}>{children}</p>
        ),
        strong: ({ children }) => (
          <strong className={`font-semibold ${isUser ? "text-white" : "text-[#111111]"}`}>
            {children}
          </strong>
        ),
        ul: ({ children }) => (
          <ul className={`list-disc space-y-1.5 pl-4 ${isUser ? "my-0" : "my-2 mb-2.5"}`}>
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className={`list-decimal space-y-1.5 pl-4 ${isUser ? "my-0" : "my-2 mb-2.5"}`}>
            {children}
          </ol>
        ),
        li: ({ children }) => <li className="leading-snug">{children}</li>,
        h1: ({ children }) => (
          <p className="mb-2 text-[14px] font-semibold text-[#111111]">{children}</p>
        ),
        h2: ({ children }) => (
          <p className="mb-2 mt-3 text-[13px] font-semibold tracking-wide text-[#374151] first:mt-0">
            {children}
          </p>
        ),
        h3: ({ children }) => (
          <p className="mb-1.5 mt-2 text-[13px] font-semibold text-[#374151] first:mt-0">
            {children}
          </p>
        ),
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-[#0052ff] underline-offset-2 hover:underline"
          >
            {children}
          </a>
        ),
      }}
    >
      {markdown}
    </ReactMarkdown>
    </div>
  );
}
