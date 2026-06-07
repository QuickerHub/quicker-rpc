"use client";

import type { SettingsIntentRunEntry } from "@/lib/quicker-settings-intent-runs";
import type { LauncherAgentRunEntry } from "@/lib/tool-test-launcher-agent-runs";
import type { LauncherResolveRunEntry } from "@/lib/tool-test-launcher-resolve-runs";
import { ToolTestLauncherAgentPanel } from "@/components/tool-test/ToolTestLauncherAgentPanel";
import { ToolTestLauncherResolvePanel } from "@/components/tool-test/ToolTestLauncherResolvePanel";
import { ToolTestSettingsIntentPanel } from "@/components/tool-test/ToolTestSettingsIntentPanel";

export type ToolTestLauncherSubTab = "agent" | "resolve" | "intent";

type ToolTestLauncherPanelProps = {
  subTab: ToolTestLauncherSubTab;
  onSubTabChange: (tab: ToolTestLauncherSubTab) => void;
  disabled?: boolean;
  workingDirectory?: string;
  onAppendAgentRun: (entry: LauncherAgentRunEntry) => void;
  onPatchAgentRun: (id: string, patch: Partial<LauncherAgentRunEntry>) => void;
  onAppendResolveRun: (entry: LauncherResolveRunEntry) => void;
  onPatchResolveRun: (id: string, patch: Partial<LauncherResolveRunEntry>) => void;
  onAppendIntentRun: (entry: SettingsIntentRunEntry) => void;
  onPatchIntentRun: (id: string, patch: Partial<SettingsIntentRunEntry>) => void;
};

const SUB_TABS: { id: ToolTestLauncherSubTab; label: string; title: string }[] = [
  { id: "agent", label: "Agent", title: "Launcher + Auto 完整对话" },
  { id: "resolve", label: "Resolve", title: "launcher_resolve 打分排序" },
  { id: "intent", label: "Intent", title: "settings resolve golden cases" },
];

export function ToolTestLauncherPanel({
  subTab,
  onSubTabChange,
  disabled,
  workingDirectory,
  onAppendAgentRun,
  onPatchAgentRun,
  onAppendResolveRun,
  onPatchResolveRun,
  onAppendIntentRun,
  onPatchIntentRun,
}: ToolTestLauncherPanelProps) {
  return (
    <div className="tool-test-launcher-panel">
      <div
        className="tool-test-launcher-subtabs"
        role="tablist"
        aria-label="启动器测试层"
      >
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={subTab === tab.id}
            title={tab.title}
            className={`tool-test-launcher-subtabs__btn${subTab === tab.id ? " tool-test-launcher-subtabs__btn--active" : ""}`}
            onClick={() => onSubTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {subTab === "agent" ? (
        <ToolTestLauncherAgentPanel
          disabled={disabled}
          workingDirectory={workingDirectory}
          onAppendRun={onAppendAgentRun}
          onPatchRun={onPatchAgentRun}
        />
      ) : subTab === "resolve" ? (
        <ToolTestLauncherResolvePanel
          disabled={disabled}
          workingDirectory={workingDirectory}
          onAppendRun={onAppendResolveRun}
          onPatchRun={onPatchResolveRun}
        />
      ) : (
        <ToolTestSettingsIntentPanel
          disabled={disabled}
          onAppendRun={onAppendIntentRun}
          onPatchRun={onPatchIntentRun}
        />
      )}
    </div>
  );
}
