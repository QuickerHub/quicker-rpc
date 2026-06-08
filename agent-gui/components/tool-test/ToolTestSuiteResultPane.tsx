"use client";

import { useEffect, useRef } from "react";
import type { ToolSuiteRunEntry } from "@/lib/tool-test-suite-runs";
import {
  findToolTestSession,
  getToolTestSessionParts,
} from "@/lib/tool-test-tools-session";
import { ToolTestToolsResultStream } from "@/components/tool-test/ToolTestToolsResultStream";
import { ToolTestRunsPaneShell } from "@/components/tool-test/ToolTestRunsPaneShell";

type ToolTestSuiteResultPaneProps = {
  runs: ToolSuiteRunEntry[];
  workingDirectory?: string;
  onClearRuns: () => void;
};

export function ToolTestSuiteResultPane({
  runs,
  workingDirectory,
  onClearRuns,
}: ToolTestSuiteResultPaneProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const session = findToolTestSession(runs);
  const parts = session ? getToolTestSessionParts(session) : [];
  const okCount = parts.filter(
    (p) => "state" in p && p.state === "output-available",
  ).length;

  useEffect(() => {
    endRef.current?.scrollIntoView({
      behavior: parts.length > 1 ? "smooth" : "auto",
    });
  }, [parts.length, session?.status]);

  const subText =
    parts.length === 0
      ? "Run a tool from the sidebar"
      : `${parts.length} calls · ${okCount} ok${session?.status === "running" ? " · running…" : ""}`;

  return (
    <ToolTestRunsPaneShell
      className="tool-test-title-pane--tools"
      heading="Results"
      subText={subText}
      emptyText="All tool runs appear in this panel. Use Run on the left, or Run all."
      runs={session ? [session] : []}
      workingDirectory={workingDirectory}
      onClearRuns={onClearRuns}
      clearedLabel="Cleared session"
      streamAnchorRef={endRef}
    >
      {session ? (
        <div className="tool-test-tools-session">
          <ToolTestToolsResultStream
            parts={parts}
            workingDirectory={workingDirectory}
            status={session.status}
          />
        </div>
      ) : null}
    </ToolTestRunsPaneShell>
  );
}
