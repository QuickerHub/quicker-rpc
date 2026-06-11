"use client";

import { useEffect, useRef } from "react";
import { EmbeddedXterm } from "@/components/terminal/EmbeddedXterm";
import { IconBrowserNewTab } from "@/components/browser/embedded-browser-icons";
import { SidePanelIconClose } from "@/components/workspace/side-panel-view-icons";
import { useEmbeddedTerminal } from "@/lib/embedded-terminal-context";
import { useEmbeddedTerminalTabs } from "@/lib/embedded-terminal-tabs";
import { useWorkspaceExplorerTree } from "@/lib/workspace-explorer";
import {
  prefetchTerminalSession,
  prefetchTerminalStack,
} from "@/lib/terminal-session-client";

/** Terminal panel: internal session tabs only (no side-header tab). */
export function WorkspaceEmbeddedTerminal() {
  const { open: panelOpen } = useEmbeddedTerminal();
  const {
    tabs,
    activeTerminalId,
    setActiveTerminalId,
    ensureInitialTab,
    addTab,
    closeTab,
    mountedTerminalIds,
  } = useEmbeddedTerminalTabs();
  const { cwd } = useWorkspaceExplorerTree();
  const internalTabsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!panelOpen) return;
    const firstId = ensureInitialTab();
    prefetchTerminalStack(cwd, firstId);
  }, [panelOpen, cwd, ensureInitialTab]);

  useEffect(() => {
    if (!panelOpen || tabs.length === 0) return;
    for (const tab of tabs) {
      prefetchTerminalSession(tab.id, cwd);
    }
  }, [panelOpen, tabs, cwd]);

  const terminalIds = mountedTerminalIds(panelOpen);
  if (terminalIds.length === 0) return null;

  const cwdLabel = cwd.trim() || "工作区";

  return (
    <section className="workspace-embedded-terminal" aria-label="终端">
      <header className="workspace-explorer-head workspace-embedded-terminal__head">
        <span className="workspace-explorer-title">终端</span>
        <span
          className="workspace-embedded-terminal__cwd"
          title={cwd.trim() || undefined}
        >
          {cwdLabel}
        </span>
        <span
          className="workspace-embedded-terminal__badge"
          title="本机 PTY（node-pty）· 会话复用"
        >
          PTY
        </span>
      </header>

      <div
        className="workspace-embedded-terminal__internal-tabs"
        role="tablist"
        aria-label="终端会话"
        ref={internalTabsRef}
      >
        {tabs.map((tab) => {
          const active = tab.id === activeTerminalId;
          return (
            <div
              key={tab.id}
              className={`workspace-embedded-terminal__internal-tab${active ? " workspace-embedded-terminal__internal-tab--active" : ""}`}
            >
              <button
                type="button"
                role="tab"
                className="workspace-embedded-terminal__internal-tab-main"
                aria-selected={active}
                title={tab.label}
                onClick={() => setActiveTerminalId(tab.id)}
              >
                {tab.label}
              </button>
              <button
                type="button"
                className="workspace-embedded-terminal__internal-tab-close"
                aria-label={`关闭 ${tab.label}`}
                title="关闭"
                onClick={(event) => {
                  event.stopPropagation();
                  closeTab(tab.id);
                }}
              >
                <SidePanelIconClose />
              </button>
            </div>
          );
        })}
        <button
          type="button"
          className="workspace-explorer-action workspace-embedded-terminal__new-tab"
          aria-label="新建终端"
          title="新建终端"
          onClick={() => {
            const id = addTab();
            prefetchTerminalSession(id, cwd);
          }}
        >
          <IconBrowserNewTab />
        </button>
      </div>

      <div className="workspace-embedded-terminal__body workspace-embedded-terminal__body--stack">
        {terminalIds.map((terminalId) => (
          <EmbeddedXterm
            key={terminalId}
            terminalId={terminalId}
            cwd={cwd}
            visible={activeTerminalId === terminalId}
            className="workspace-embedded-terminal__xterm workspace-embedded-terminal__xterm--stacked"
          />
        ))}
      </div>
    </section>
  );
}
