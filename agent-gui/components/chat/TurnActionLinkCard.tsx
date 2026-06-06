"use client";

import { useMemo } from "react";
import type { AgentUIMessage } from "@/lib/chat-types";
import { resolveTurnActionLinkFallback } from "@/lib/turn-action-link";
import { ActionLinkBar } from "@/components/chat/ActionLinkBar";

type TurnActionLinkCardProps = {
  turnMessages: AgentUIMessage[];
  workingDirectory?: string;
  onInsertComposerPrompt?: (text: string) => void;
};

export function TurnActionLinkCard({
  turnMessages,
  workingDirectory,
  onInsertComposerPrompt,
}: TurnActionLinkCardProps) {
  const links = useMemo(
    () => resolveTurnActionLinkFallback(turnMessages),
    [turnMessages],
  );

  if (!links?.length) return null;

  return (
    <div className="msg-turn-action-link" role="region" aria-label="动作快捷卡片">
      <ActionLinkBar
        links={links}
        workingDirectory={workingDirectory}
        onInsertComposerPrompt={onInsertComposerPrompt}
      />
    </div>
  );
}
