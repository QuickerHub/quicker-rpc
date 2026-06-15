import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  loadBenchmarkTask,
  resolveBenchmarkTaskIds,
  type AgentEvalBenchmarkTask,
} from "@/lib/agent-eval/benchmark-catalog";
import type { LauncherEvalExpect } from "@/lib/agent-eval/launcher-expect";

export type AgentEvalScenarioExpect = {
  mustCall?: string[];
  /** At least one tool in the list must appear (OR). */
  mustCallAny?: string[];
  mustNotCall?: string[];
  finishWithinSteps?: number;
  launcher?: LauncherEvalExpect;
};

export type AgentEvalScenario = {
  id: string;
  label: string;
  userPrompt: string;
  chatMode: "agent" | "launcher";
  readOnly?: boolean;
  tier?: string;
  category?: string;
  mockProfile?: string;
  /** Subdirectory under benchmarks/fixtures/ */
  fixture?: string;
  expect?: AgentEvalScenarioExpect;
  source: "authoring" | "agent-gui";
};

export type AgentGuiScenarioCatalog = {
  version: number;
  scenarios: Array<{
    id: string;
    category: string;
    label: string;
    userPrompt: string;
    chatMode: "agent" | "launcher";
    readOnly?: boolean;
    mockProfile?: string;
    fixture?: string;
    expect?: AgentEvalScenarioExpect;
  }>;
};

const GUI_CATALOG_PATH = join(
  process.cwd(),
  "benchmarks",
  "agent-gui-scenarios.json",
);

export const GUI_LAUNCHER_SCENARIO_IDS = [
  "launcher-open-hotkeys",
  "launcher-open-recycle-bin",
  "launcher-open-search",
  "launcher-run-vague",
] as const;

export const GUI_SMOKE_SCENARIO_IDS = [
  "launcher-open-hotkeys",
  "workspace-structure-readonly",
] as const;

export const GUI_AGENT_DEFS_SCENARIO_IDS = [
  "slash-list-actions",
  "task-readonly-explore",
] as const;

export function defaultWorkspaceRoot(): string {
  return (
    process.env.QKRPC_WORKSPACE_ROOT?.trim()
    || process.env.QKRPC_CWD?.trim()
    || join(process.cwd(), "..")
  );
}

export function resolveScenarioWorkingDirectory(
  scenario: AgentEvalScenario,
): string {
  const fixture = scenario.fixture?.trim();
  if (fixture) {
    return join(process.cwd(), "benchmarks", "fixtures", fixture);
  }
  return defaultWorkspaceRoot();
}

function catalogPath(path?: string): string {
  return path ?? GUI_CATALOG_PATH;
}

export function loadGuiScenarioCatalog(
  path?: string,
): AgentGuiScenarioCatalog {
  return JSON.parse(
    readFileSync(catalogPath(path), "utf8"),
  ) as AgentGuiScenarioCatalog;
}

export function loadGuiScenario(
  id: string,
  path?: string,
): AgentEvalScenario {
  const catalog = loadGuiScenarioCatalog(path);
  const row = catalog.scenarios.find((s) => s.id === id);
  if (!row) {
    const examples = catalog.scenarios.map((s) => s.id).slice(0, 6).join(", ");
    throw new Error(`Unknown gui scenario "${id}". Examples: ${examples}, …`);
  }
  return {
    id: row.id,
    label: row.label,
    userPrompt: row.userPrompt,
    chatMode: row.chatMode,
    readOnly: row.readOnly,
    category: row.category,
    mockProfile: row.mockProfile,
    fixture: row.fixture,
    expect: row.expect,
    source: "agent-gui",
  };
}

export function authoringTaskToScenario(
  task: AgentEvalBenchmarkTask,
): AgentEvalScenario {
  return {
    id: task.id,
    label: task.label ?? task.id,
    userPrompt: task.userPrompt,
    chatMode: "agent",
    readOnly: task.readOnly,
    tier: task.tier,
    category: task.category,
    mockProfile: task.verify?.mockProfile,
    source: "authoring",
  };
}

export function loadEvalScenario(id: string): AgentEvalScenario {
  try {
    return loadGuiScenario(id);
  } catch (guiErr) {
    try {
      return authoringTaskToScenario(loadBenchmarkTask(id));
    } catch {
      throw guiErr;
    }
  }
}

export function listGuiScenariosByCategory(
  category: string,
  path?: string,
): AgentEvalScenario[] {
  return loadGuiScenarioCatalog(path)
    .scenarios.filter((s) => s.category === category)
    .map((row) => ({
      id: row.id,
      label: row.label,
      userPrompt: row.userPrompt,
      chatMode: row.chatMode,
      readOnly: row.readOnly,
      category: row.category,
      mockProfile: row.mockProfile,
      fixture: row.fixture,
      expect: row.expect,
      source: "agent-gui" as const,
    }));
}

export function resolveEvalScenarioIds(options: {
  ids?: string[];
  tier?: string;
  preset?: string;
  limit?: number;
}): string[] {
  let ids: string[];

  if (options.preset === "gui-launcher") {
    ids = [...GUI_LAUNCHER_SCENARIO_IDS];
  } else if (options.preset === "gui-smoke") {
    ids = [...GUI_SMOKE_SCENARIO_IDS];
  } else if (options.preset === "gui-agent-defs") {
    ids = [...GUI_AGENT_DEFS_SCENARIO_IDS];
  } else if (options.preset === "gui-all") {
    ids = loadGuiScenarioCatalog().scenarios.map((s) => s.id);
  } else {
    return resolveBenchmarkTaskIds({
      ids: options.ids,
      tier: options.tier,
      preset: options.preset,
      limit: options.limit,
    });
  }

  for (const id of ids) {
    loadEvalScenario(id);
  }
  const limit = options.limit ?? ids.length;
  return ids.slice(0, limit);
}
