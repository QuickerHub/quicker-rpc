"use client";

import type { SlashTagRef } from "@/lib/composer-slash-tag";
import { slashItemLabel } from "@/lib/composer-slash-catalog";

type SlashPromptTagProps = {
  slash: SlashTagRef;
  variant?: "composer" | "menu" | "sent";
};

export function SlashPromptTag({
  slash,
  variant = "composer",
}: SlashPromptTagProps) {
  const className = [
    "composer-prompt-tag",
    "composer-prompt-tag--slash",
    `composer-prompt-tag--slash-${slash.kind}`,
    variant === "sent" ? "composer-prompt-tag--sent" : "",
    variant === "menu" ? "composer-prompt-tag--slash-menu" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={className}>
      <span
        className="composer-prompt-tag__icon composer-prompt-tag__icon--slash"
        aria-hidden
      >
        /
      </span>
      <span className="composer-prompt-tag__title">
        {slashItemLabel({ ...slash, description: "", scope: "" })}
      </span>
    </span>
  );
}
