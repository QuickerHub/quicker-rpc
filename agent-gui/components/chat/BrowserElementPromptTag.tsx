"use client";

import type { BrowserElementTag } from "@/lib/browser-element-tag";

type BrowserElementPromptTagProps = {
  element: BrowserElementTag;
  variant?: "composer" | "sent";
};

export function BrowserElementPromptTag({
  element,
  variant = "composer",
}: BrowserElementPromptTagProps) {
  const tooltip = [
    element.chipTitle,
    element.title?.trim() || null,
    element.url,
    element.ref ? `ref=${element.ref}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <span
      className={`composer-prompt-tag composer-prompt-tag--browser-element${variant === "sent" ? " composer-prompt-tag--sent" : ""}`}
      title={tooltip}
    >
      <span className="composer-prompt-tag__icon composer-prompt-tag__icon--browser" aria-hidden>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path
            d="M1.5 8.5 8.5 1.5M8.5 1.5H5.5M8.5 1.5V4.5"
            stroke="currentColor"
            strokeWidth="1.1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="2.75" cy="7.25" r="0.85" fill="currentColor" />
        </svg>
      </span>
      <span className="composer-prompt-tag__title">{element.chipTitle}</span>
    </span>
  );
}
