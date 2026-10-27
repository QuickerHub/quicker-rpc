import type { CSSProperties, ReactNode, Ref } from "react";
import { ConversationPresentationProvider } from "@/lib/conversation-presentation";

export interface AgentWorkbenchShellProps {
  sidebar?: ReactNode;
  sidebarToggle?: ReactNode;
  sidebarCollapsed: boolean;
  className?: string;
  children: ReactNode;
}

/** Layout slots stay independent from chat and workspace state. */
export function AgentWorkbenchShell({
  sidebar,
  sidebarToggle,
  sidebarCollapsed,
  className,
  children,
}: AgentWorkbenchShellProps) {
  return (
    <div
      className={[
        "app-shell",
        sidebarCollapsed && "app-shell--sidebar-collapsed",
        className,
      ].filter(Boolean).join(" ")}
      suppressHydrationWarning
    >
      {sidebarToggle != null ? (
        <div className="app-shell-toggle-slot">{sidebarToggle}</div>
      ) : null}
      {sidebar != null ? (
        <div className="workspace-rail" aria-hidden={sidebarCollapsed}>
          {sidebar}
        </div>
      ) : null}
      <div className="app-main-column">{children}</div>
    </div>
  );
}

export interface AgentConversationFrameProps {
  className?: string;
  style?: CSSProperties;
  visible: boolean;
  chatVisible?: boolean;
  frameRef: Ref<HTMLDivElement>;
  mainBodyRef: Ref<HTMLDivElement>;
  chatColumnRef: Ref<HTMLDivElement>;
  header?: ReactNode;
  dockHeader?: ReactNode;
  messages: ReactNode;
  approval?: ReactNode;
  composer: ReactNode;
  dock?: ReactNode;
}

/** Presentational slots preserve the existing split-panel DOM contract. */
export function AgentConversationFrame({
  className,
  style,
  visible,
  chatVisible = visible,
  frameRef,
  mainBodyRef,
  chatColumnRef,
  header,
  dockHeader,
  messages,
  approval,
  composer,
  dock,
}: AgentConversationFrameProps) {
  return (
    <div
      ref={frameRef}
      className={[
        "app-main",
        !visible && "app-main--hidden",
        className,
      ].filter(Boolean).join(" ")}
      style={style}
      aria-hidden={visible ? undefined : true}
    >
      <div className="app-main-split-header">
        <div className="app-main-split-header__chat" hidden={!chatVisible} inert={!chatVisible}>{header}</div>
        {dockHeader != null ? (
          <div className="app-main-split-header__side">{dockHeader}</div>
        ) : null}
      </div>
      <div ref={mainBodyRef} className="app-main-body">
        <ConversationPresentationProvider active={visible && chatVisible}>
          <div ref={chatColumnRef} className="app-main-chat-column" hidden={!chatVisible} inert={!chatVisible}>
            {messages}
            {approval}
            {composer}
          </div>
        </ConversationPresentationProvider>
        {dock}
      </div>
    </div>
  );
}
