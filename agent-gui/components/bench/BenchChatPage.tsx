"use client";

import { useCallback, useState } from "react";
import { DocsViewerProvider } from "@/lib/docs-viewer";
import { EmbeddedBrowserProvider } from "@/lib/embedded-browser-context";
import { EmbeddedBrowserTabsProvider } from "@/lib/embedded-browser-tabs";
import { EmbeddedTerminalProvider } from "@/lib/embedded-terminal-context";
import { EmbeddedTerminalTabsProvider } from "@/lib/embedded-terminal-tabs";
import {
  WorkspaceExplorerPanelProvider,
  WorkspaceExplorerShellProvider,
} from "@/lib/workspace-explorer";
import {
  applySidebarCollapsed,
} from "@/lib/sidebar-prefs";
import { SidebarToggle } from "@/components/chat/SidebarToggle";
import { AppMainWorkspaceSplit } from "@/components/workspace/AppMainWorkspaceSplit";
import { BenchChatProvider, useBenchChat } from "./BenchChatProvider";
import { BenchTaskSidebar } from "./BenchTaskSidebar";
import { BenchTitlebar } from "./BenchTitlebar";
import { BenchStatusBar } from "./BenchStatusBar";
import { BenchChatPanel } from "./BenchChatPanel";

function BenchChatShell() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { benchWorkspace } = useBenchChat();

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      applySidebarCollapsed(next);
      return next;
    });
  }, []);

  return (
    <WorkspaceExplorerPanelProvider
      cwd={benchWorkspace ?? ""}
      cwdPending={false}
    >
      <DocsViewerProvider>
        <EmbeddedBrowserProvider>
          <EmbeddedTerminalTabsProvider>
            <EmbeddedTerminalProvider>
              <EmbeddedBrowserTabsProvider>
        <div
          className={`app-shell bench-shell${sidebarCollapsed ? " app-shell--sidebar-collapsed" : ""}`}
          suppressHydrationWarning
        >
          <div className="app-shell-toggle-slot">
            <SidebarToggle
              sidebarOpen={!sidebarCollapsed}
              onClick={toggleSidebar}
              className="shell-sidebar-toggle"
            />
          </div>
          <div className="workspace-rail" aria-hidden={sidebarCollapsed}>
            <BenchTaskSidebar />
          </div>
          <div className="app-main-column">
            <BenchTitlebar />
            <BenchStatusBar />
            <div className="app-content-row">
              <div className="app-main-shell">
                <AppMainWorkspaceSplit>
                  <BenchChatPanel />
                </AppMainWorkspaceSplit>
              </div>
            </div>
          </div>
        </div>
              </EmbeddedBrowserTabsProvider>
            </EmbeddedTerminalProvider>
          </EmbeddedTerminalTabsProvider>
        </EmbeddedBrowserProvider>
      </DocsViewerProvider>
    </WorkspaceExplorerPanelProvider>
  );
}

export function BenchChatPage() {
  return (
    <WorkspaceExplorerShellProvider>
      <BenchChatProvider>
        <BenchChatShell />
      </BenchChatProvider>
    </WorkspaceExplorerShellProvider>
  );
}
