"use client";

import type { PinnedAction } from "@/lib/action-context";

type ActionPromptTagProps = {
  action: PinnedAction;
  variant?: "composer" | "sent";
};

export function ActionPromptTag({
  action,
  variant = "composer",
}: ActionPromptTagProps) {
  return (
    <span
      className={`composer-prompt-tag${variant === "sent" ? " composer-prompt-tag--sent" : ""}`}
      title={`${action.title}\n${action.id}`}
    >
      <span className="composer-prompt-tag__title">{action.title}</span>
    </span>
  );
}
