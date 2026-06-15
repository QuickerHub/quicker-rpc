"use client";

import { ActionLinkCompactStrip } from "@/components/chat/ActionLinkCompactStrip";
import type { ParsedActionLink } from "@/lib/action-link-markup";
import { formatActionIdShort } from "@/lib/action-patch-followup";
import { useActionMetadata } from "@/lib/use-action-metadata";
import { useChatStore } from "@/lib/use-chat-store";

type ActionLinkCardProps = {
  actionId: string;
  /** Kept for call-site compatibility; ops live in the right workspace panel. */
  links?: ParsedActionLink[];
  workingDirectory?: string;
  onDismissed?: () => void;
  onInsertComposerPrompt?: (text: string) => void;
};

export function ActionLinkCard({
  actionId,
  workingDirectory: cwdProp,
  onDismissed,
  onInsertComposerPrompt,
}: ActionLinkCardProps) {
  const { store, defaultCwd } = useChatStore();
  const cwd = (cwdProp ?? (store.workingDirectory.trim() || defaultCwd)).trim();
  const metaState = useActionMetadata(actionId, cwd);

  const title =
    metaState.status === "ok"
      ? metaState.meta.title
      : metaState.status === "loading"
        ? "加载中…"
        : formatActionIdShort(actionId);
  const description =
    metaState.status === "ok" ? metaState.meta.description : undefined;
  const iconSpec =
    metaState.status === "ok" ? metaState.meta.icon : undefined;
  const displayTitle =
    metaState.status === "ok" ? metaState.meta.title : formatActionIdShort(actionId);

  return (
    <ActionLinkCompactStrip
      actionId={actionId}
      title={title}
      displayTitle={displayTitle}
      description={description}
      iconSpec={iconSpec}
      workingDirectory={cwd}
      onDismissed={onDismissed}
      onInsertComposerPrompt={onInsertComposerPrompt}
    />
  );
}
