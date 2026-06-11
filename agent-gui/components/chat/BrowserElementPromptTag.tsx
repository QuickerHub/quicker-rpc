"use client";

import { ComposerTagPreviewTrigger } from "@/components/chat/ComposerTagPreviewTrigger";
import type { BrowserElementTag } from "@/lib/browser-element-tag";
import { buildBrowserElementTagPreview } from "@/lib/composer-tag-preview";

type BrowserElementPromptTagProps = {
  element: BrowserElementTag;
  variant?: "composer" | "sent";
};

export function BrowserElementPromptTag({
  element,
  variant = "composer",
}: BrowserElementPromptTagProps) {
  const className = `composer-prompt-tag composer-prompt-tag--browser-element${
    variant === "sent" ? " composer-prompt-tag--sent" : ""
  }`;

  const chip = (
    <>
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
    </>
  );

  if (variant !== "sent") {
    return <span className={className}>{chip}</span>;
  }

  return (
    <ComposerTagPreviewTrigger
      model={buildBrowserElementTagPreview(element)}
      className={className}
    >
      {chip}
    </ComposerTagPreviewTrigger>
  );
}
