"use client";

import { ActionIcon } from "@/components/chat/ActionIcon";
import type { PinnedAction } from "@/lib/action-context";
import { resolveMentionItemIcon } from "@/lib/action-mention-items";
import {
  COMPOSER_SUBPROGRAM_TAG_ICON_CLASS,
} from "@/lib/global-subprogram-icon";

type ActionPromptTagProps = {
  action: PinnedAction;
  variant?: "composer" | "sent";
};

export function ActionPromptTag({
  action,
  variant = "composer",
}: ActionPromptTagProps) {
  const isSubprogram = action.kind === "subprogram";
  const iconSpec = resolveMentionItemIcon(action);
  const titleParts = [action.title, action.id];
  if (isSubprogram && action.callIdentifier) {
    titleParts.push(action.callIdentifier);
  }

  return (
    <span
      className={`composer-prompt-tag${
        isSubprogram ? " composer-prompt-tag--subprogram" : ""
      }${variant === "sent" ? " composer-prompt-tag--sent" : ""}`}
      title={titleParts.join("\n")}
    >
      <ActionIcon
        spec={iconSpec}
        title={action.title}
        className={
          isSubprogram
            ? COMPOSER_SUBPROGRAM_TAG_ICON_CLASS
            : "composer-prompt-tag__icon composer-prompt-tag__icon--fa"
        }
      />
      <span className="composer-prompt-tag__title">{action.title}</span>
    </span>
  );
}
