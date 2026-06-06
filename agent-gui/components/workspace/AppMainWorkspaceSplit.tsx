"use client";

import { memo, type ReactNode } from "react";

type AppMainWorkspaceSplitProps = {
  children: ReactNode;
};

/** Chat column + optional right workspace side panel (managed outside this split). */
export const AppMainWorkspaceSplit = memo(function AppMainWorkspaceSplit({
  children,
}: AppMainWorkspaceSplitProps) {
  return (
    <div className="app-main-split">
      <div className="app-main-chat-pane">
        <div className="app-main-stack">{children}</div>
      </div>
    </div>
  );
});
