"use client";

import type { Components } from "react-markdown";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { PluggableList } from "unified";
import { normalizeMarkdownGfmTables } from "@/lib/markdown-gfm-normalize";

type MarkdownMessageProps = {
  content: string;
  variant?: "user" | "assistant";
};

const remarkPlugins: PluggableList = [remarkGfm];

const markdownComponents: Components = {
  a({ href, children }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  },
  pre({ children }) {
    return <pre className="md-pre">{children}</pre>;
  },
  code({ className, children, ...props }) {
    const isFenced = Boolean(className?.includes("language-"));
    if (isFenced) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className="md-inline-code" {...props}>
        {children}
      </code>
    );
  },
  table({ children }) {
    return (
      <div className="md-table-wrap">
        <table className="md-table">{children}</table>
      </div>
    );
  },
  th({ children }) {
    return <th className="md-th">{children}</th>;
  },
  td({ children }) {
    return <td className="md-td">{children}</td>;
  },
};

export function MarkdownMessage({
  content,
  variant = "assistant",
}: MarkdownMessageProps) {
  if (!content.trim()) {
    return null;
  }

  const normalized = normalizeMarkdownGfmTables(content);

  return (
    <div className={`markdown-body markdown-body--${variant}`}>
      <Markdown remarkPlugins={remarkPlugins} components={markdownComponents}>
        {normalized}
      </Markdown>
    </div>
  );
}
