"use client";

import type { SettingsIntentRunEntry } from "@/lib/quicker-settings-intent-runs";
import type { LauncherAgentRunEntry } from "@/lib/tool-test-launcher-agent-runs";
import type { LauncherResolveRunEntry } from "@/lib/tool-test-launcher-resolve-runs";
import { ToolTestLauncherAgentResultPane } from "@/components/tool-test/ToolTestLauncherAgentResultPane";
import { ToolTestLauncherResolveResultPane } from "@/components/tool-test/ToolTestLauncherResolveResultPane";
import { ToolTestSettingsIntentResultPane } from "@/components/tool-test/ToolTestSettingsIntentResultPane";
import type { ChatAddToolOutput } from "@/lib/chat-tool-actions";
import type { ToolTestLauncherSubTab } from "@/components/tool-test/ToolTestLauncherPanel";

type ToolTestLauncherResultPaneProps = {
  subTab: ToolTestLauncherSubTab;
  agentRuns: LauncherAgentRunEntry[];
  resolveRuns: LauncherResolveRunEntry[];
  intentRuns: SettingsIntentRunEntry[];
  workingDirectory?: string;
  onClearAgentRuns: () => void;
  onClearResolveRuns: () => void;
  onClearIntentRuns: () => void;
  launcherAgentAddToolOutput?: ChatAddToolOutput | null;
};

export function ToolTestLauncherResultPane({
  subTab,
  agentRuns,
  resolveRuns,
  intentRuns,
  workingDirectory,
  onClearAgentRuns,
  onClearResolveRuns,
  onClearIntentRuns,
  launcherAgentAddToolOutput,
}: ToolTestLauncherResultPaneProps) {
  if (subTab === "agent") {
    return (
      <ToolTestLauncherAgentResultPane
        runs={agentRuns}
        workingDirectory={workingDirectory}
        onClearRuns={onClearAgentRuns}
        addToolOutput={launcherAgentAddToolOutput}
      />
    );
  }
  if (subTab === "resolve") {
    return (
      <ToolTestLauncherResolveResultPane
        runs={resolveRuns}
        onClearRuns={onClearResolveRuns}
      />
    );
  }
  return (
    <ToolTestSettingsIntentResultPane
      runs={intentRuns}
      onClearRuns={onClearIntentRuns}
    />
  );
}
