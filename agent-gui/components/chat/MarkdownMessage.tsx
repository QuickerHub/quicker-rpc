"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Components } from "react-markdown";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { PluggableList } from "unified";
import { normalizeMarkdownGfmTables } from "@/lib/markdown-gfm-normalize";

async function writeClipboardText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* fall through */
    }
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

function IconCopy() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect
        x="4.25"
        y="4.25"
        width="6.5"
        height="7.5"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M5.25 4.25V3.5a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1v.75"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M3.5 7.25L6 9.75L10.5 4.75"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MarkdownPreBlock({ children }: { children?: React.ReactNode }) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current != null) {
        window.clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  const handleCopy = useCallback(async () => {
    const text = preRef.current?.textContent ?? "";
    if (!text.trim()) return;

    const ok = await writeClipboardText(text);
    if (!ok) return;

    setCopied(true);
    if (copiedTimerRef.current != null) {
      window.clearTimeout(copiedTimerRef.current);
    }
    copiedTimerRef.current = window.setTimeout(() => {
      setCopied(false);
      copiedTimerRef.current = null;
    }, 1600);
  }, []);

  return (
    <div className="md-pre-wrap">
      <button
        type="button"
        className={`md-pre-copy-btn${copied ? " md-pre-copy-btn--copied" : ""}`}
        aria-label={copied ? "已复制" : "复制代码"}
        title={copied ? "已复制" : "复制"}
        onClick={() => void handleCopy()}
      >
        {copied ? <IconCheck /> : <IconCopy />}
      </button>
      <pre ref={preRef} className="md-pre">{children}</pre>
    </div>
  );
}

type MarkdownMessageProps = {
  content: string;
  variant?: "user" | "assistant";
  /** Render paragraphs inline (for mixed tag + prose). */
  inline?: boolean;
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
    return <MarkdownPreBlock>{children}</MarkdownPreBlock>;
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
  inline = false,
}: MarkdownMessageProps) {
  if (!content.trim()) {
    return null;
  }

  const normalized = normalizeMarkdownGfmTables(content);
  const components: Components = inline
    ? {
        ...markdownComponents,
        p: ({ children }) => (
          <span className="markdown-inline-p">{children}</span>
        ),
      }
    : markdownComponents;

  return (
    <div
      className={`markdown-body markdown-body--${variant}${
        inline ? " markdown-body--inline" : ""
      }`}
    >
      <Markdown remarkPlugins={remarkPlugins} components={components}>
        {normalized}
      </Markdown>
    </div>
  );
}
