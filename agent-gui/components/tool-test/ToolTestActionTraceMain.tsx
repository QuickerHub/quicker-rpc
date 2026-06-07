"use client";

import { ActionTracePanel } from "@/components/action-trace/ActionTracePanel";
import { useActionTraceTabs } from "@/lib/action-trace-overlay";

type ToolTestActionTraceMainProps = {
  className?: string;
  pingOk?: boolean;
};

/** Tool-test main pane: show the most recently opened trace tab. */
export function ToolTestActionTraceMain({
  className,
  pingOk,
}: ToolTestActionTraceMainProps) {
  const tabs = useActionTraceTabs();
  const tabId = tabs[tabs.length - 1]?.tabId ?? null;

  return (
    <ActionTracePanel
      tabId={tabId}
      className={className}
      pingOk={pingOk}
    />
  );
}
