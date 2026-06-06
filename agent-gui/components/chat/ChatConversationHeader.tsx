"use client";

import { ExplorerPanelToggle } from "@/components/workspace/WorkspaceExplorerPanel";
import { plainTitleText } from "@/lib/plain-title-text";
import { useWorkspaceExplorerShell } from "@/lib/workspace-explorer";

type ChatConversationHeaderProps = {
  title: string;
};

/** Per-thread toolbar below the global tab titlebar (Cursor-style). */
export function ChatConversationHeader({ title }: ChatConversationHeaderProps) {
  const { panelOpen } = useWorkspaceExplorerShell();
  const label = plainTitleText(title);

  return (
    <header className="chat-conversation-header" aria-label="对话工具栏">
      <h2 className="chat-conversation-header__title" title={label}>
        {label}
      </h2>
      {!panelOpen ? (
        <div className="chat-conversation-header__actions">
          <ExplorerPanelToggle className="chat-conversation-header__action-btn" />
        </div>
      ) : null}
    </header>
  );
}
