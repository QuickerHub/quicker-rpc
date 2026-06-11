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
import { DEFAULT_EMBEDDED_TERMINAL_ID } from "@/lib/workspace-side-panel-view";

/** Side-panel terminal: one outer tab, internal session tabs (VS Code-style). */
export function WorkspaceEmbeddedTerminal() {
  const { open: panelOpen } = useEmbeddedTerminal();
  const {
    tabs: extraTabs,
    activeTerminalId,
    setActiveTerminalId,
    addTab,
    closeTab,
    mountedTerminalIds,
  } = useEmbeddedTerminalTabs();
  const { cwd } = useWorkspaceExplorerTree();
  const internalTabsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!panelOpen) return;
    prefetchTerminalStack(cwd);
  }, [panelOpen, cwd]);

  const terminalIds = mountedTerminalIds(panelOpen);
  if (terminalIds.length === 0) return null;

  const cwdLabel = cwd.trim() || "工作区";

  const internalTabItems = [
    { id: DEFAULT_EMBEDDED_TERMINAL_ID, label: "终端" },
    ...extraTabs,
  ];

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
        {internalTabItems.map((tab) => {
          const active = tab.id === activeTerminalId;
          const canClose = tab.id !== DEFAULT_EMBEDDED_TERMINAL_ID;
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
              {canClose ? (
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
              ) : null}
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
