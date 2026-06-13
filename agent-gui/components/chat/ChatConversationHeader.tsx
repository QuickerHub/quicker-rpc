"use client";

import { useActionDesignerEmbed } from "@/lib/designer-embed-context";
import { ExplorerPanelToggle } from "@/components/workspace/WorkspaceExplorerPanel";
import { useWorkspaceExplorerShell } from "@/lib/workspace-explorer";

/** Per-thread toolbar below the global tab titlebar (Cursor-style). */
export function ChatConversationHeader() {
  const designerEmbed = useActionDesignerEmbed();
  const { panelOpen } = useWorkspaceExplorerShell();

  if (designerEmbed.enabled) return null;

  // Title lives in the tab bar; keep only the side-panel toggle when collapsed.
  if (panelOpen) return null;

  return (
    <header className="chat-conversation-header" aria-label="对话工具栏">
      <div className="chat-conversation-header__actions">
        <ExplorerPanelToggle className="chat-conversation-header__action-btn" />
      </div>
    </header>
  );
}
