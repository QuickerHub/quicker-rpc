"use client";

import { ActionIcon } from "@/components/chat/ActionIcon";
import { ComposerTagPreviewTrigger } from "@/components/chat/ComposerTagPreviewTrigger";
import type { PinnedAction } from "@/lib/action-context";
import { resolveMentionItemIcon } from "@/lib/action-mention-items";
import { buildActionTagPreview } from "@/lib/composer-tag-preview";
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
  const previewable = variant === "sent";

  const chip = (
    <>
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
    </>
  );

  const className = `composer-prompt-tag${
    isSubprogram ? " composer-prompt-tag--subprogram" : ""
  }${variant === "sent" ? " composer-prompt-tag--sent" : ""}`;

  if (!previewable) {
    return <span className={className}>{chip}</span>;
  }

  return (
    <ComposerTagPreviewTrigger
      model={buildActionTagPreview(action)}
      className={className}
    >
      {chip}
    </ComposerTagPreviewTrigger>
  );
}
