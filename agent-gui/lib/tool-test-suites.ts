/** Predefined tool calls for /tool-test: one suite = one tool = one execute(). */

import { formatToolTestInputCompact } from "@/lib/tool-test-input-format";

export type ToolTestSuiteGroupId =
  | "docs"
  | "catalog"
  | "workspace"
  | "qkrpc"
  | "settings"
  | "runtime"
  | "network"
  | "gates";

export const TOOL_TEST_SUITE_GROUPS: ReadonlyArray<{
  id: ToolTestSuiteGroupId;
  title: string;
}> = [
  { id: "docs", title: "Docs" },
  { id: "catalog", title: "Catalog" },
  { id: "workspace", title: "Workspace" },
  { id: "qkrpc", title: "Quicker RPC" },
  { id: "settings", title: "Settings" },
  { id: "runtime", title: "Runtime" },
  { id: "network", title: "Network" },
  { id: "gates", title: "Gates" },
] as const;

export type ToolTestStep = {
  id: string;
  label: string;
  toolName: string;
  input: Record<string, unknown>;
  optional?: boolean;
};

export type ToolTestSuite = {
  id: string;
  title: string;
  description: string;
  group: ToolTestSuiteGroupId;
  steps: ToolTestStep[];
  requiresQkrpc?: boolean;
  optional?: boolean;
  interactive?: boolean;
  writes?: boolean;
};

type ToolTestCallDef = {
  toolName: string;
  input: Record<string, unknown>;
  group: ToolTestSuiteGroupId;
  description?: string;
  requiresQkrpc?: boolean;
  optional?: boolean;
  interactive?: boolean;
  writes?: boolean;
  optionalStep?: boolean;
};

function buildSuite(def: ToolTestCallDef): ToolTestSuite {
  const compact = formatToolTestInputCompact(def.input);
  return {
    id: def.toolName,
    title: def.toolName,
    description: def.description ?? compact,
    group: def.group,
    requiresQkrpc: def.requiresQkrpc,
    optional: def.optional,
    interactive: def.interactive,
    writes: def.writes,
    steps: [
      {
        id: "call",
        label: def.toolName,
        toolName: def.toolName,
        input: def.input,
        optional: def.optionalStep,
      },
    ],
  };
}

/** One representative call per automatable tool (English id = suite title). */
const TOOL_TEST_CALLS: ToolTestCallDef[] = [
  {
    toolName: "browser",
    group: "network",
    optional: true,
    input: { action: "status" },
    description: "browser status — needs browser-runtime",
  },
  {
    toolName: "browser_to_action",
    group: "network",
    input: {
      source: "recordings",
      recordings: [
        {
          source: "browser",
          input: { action: "navigate", url: "https://example.com" },
        },
      ],
    },
    description: "Convert explicit browser recording entries to action step draft",
  },
  {
    toolName: "dev_frontend_check",
    group: "runtime",
    input: { clearCaptured: false, paths: ["/tool-test"] },
  },
  {
    toolName: "docs",
    group: "docs",
    input: { action: "search", query: "authoring workflow P1", limit: 3 },
  },
  {
    toolName: "launcher_resolve",
    group: "settings",
    requiresQkrpc: true,
    input: { query: "功能快捷键", limit: 6 },
  },
  {
    toolName: "llm_settings",
    group: "settings",
    input: { action: "list" },
  },
  {
    toolName: "qkrpc_action_query",
    group: "qkrpc",
    requiresQkrpc: true,
    input: { limit: 5 },
  },
  {
    toolName: "qkrpc_action_delete",
    group: "gates",
    requiresQkrpc: true,
    interactive: true,
    input: { id: "00000000-0000-0000-0000-000000000001" },
    description: "Triggers delete approval UI — cancel to finish",
  },
  {
    toolName: "qkrpc_fa",
    group: "catalog",
    requiresQkrpc: true,
    input: { action: "search", query: "robot", limit: 5 },
  },
  {
    toolName: "qkrpc_step_runner_get",
    group: "catalog",
    requiresQkrpc: true,
    input: { key: "sys:getClipboardText" },
  },
  {
    toolName: "qkrpc_step_runner_search",
    group: "catalog",
    requiresQkrpc: true,
    input: { query: "移动", limit: 8 },
  },
  {
    toolName: "qkrpc_subprogram_query",
    group: "qkrpc",
    requiresQkrpc: true,
    input: { limit: 5 },
  },
  {
    toolName: "qkrpc_wait",
    group: "qkrpc",
    requiresQkrpc: true,
    input: { timeoutSeconds: 5, intervalSeconds: 1 },
  },
  {
    toolName: "quicker_trigger",
    group: "settings",
    requiresQkrpc: true,
    input: { action: "events", query: "url" },
    description: "List trigger event types matching url keyword",
  },
  {
    toolName: "quicker_settings",
    group: "settings",
    requiresQkrpc: true,
    input: { action: "search", query: "快捷键", limit: 5 },
  },
  {
    toolName: "Shell",
    group: "runtime",
    input: {
      description: "Git version",
      command: "git --version",
    },
  },
  {
    toolName: "StrReplace",
    group: "workspace",
    writes: true,
    input: {
      path: ".local/tool-test-suite.txt",
      oldString: "tool-test-suite-ok",
      newString: "tool-test-suite-patched",
    },
    description: "Patch scratch file — run Write suite first or create .local/tool-test-suite.txt",
  },
  {
    toolName: "task",
    group: "runtime",
    input: {
      agent: "tool-test-echo",
      prompt: "Reply with exactly: tool-test-ok",
    },
    description: "Bundled tool-test-echo subagent — text-only echo",
  },
  {
    toolName: "Grep",
    group: "workspace",
    input: {
      pattern: "tool-registry",
      glob: "*.ts",
      path: "agent-gui/lib",
      head_limit: 5,
    },
  },
  {
    toolName: "Read",
    group: "workspace",
    input: {
      path: "agent-gui/package.json",
      startLine: 1,
      endLine: 12,
    },
  },
  {
    toolName: "user_browser",
    group: "network",
    requiresQkrpc: true,
    optional: true,
    input: { action: "tabs" },
    description: "List user browser tabs — needs Quicker Connector extension",
  },
  {
    toolName: "web_search",
    group: "network",
    optional: true,
    input: { query: "Quicker automation", limit: 3 },
  },
  {
    toolName: "Write",
    group: "workspace",
    writes: true,
    input: {
      path: ".local/tool-test-suite.txt",
      content: "tool-test-suite-ok\n",
    },
  },
  {
    toolName: "workspace_program",
    group: "workspace",
    input: { action: "projects_list", target: "all" },
  },
];

export const TOOL_TEST_SUITES: ToolTestSuite[] = TOOL_TEST_CALLS.map(buildSuite).sort(
  (a, b) => a.title.localeCompare(b.title),
);

export function getToolTestSuite(id: string): ToolTestSuite | undefined {
  return TOOL_TEST_SUITES.find((s) => s.id === id);
}

export function toolTestSuitesForGroup(
  groupId: ToolTestSuiteGroupId,
): ToolTestSuite[] {
  return TOOL_TEST_SUITES.filter((s) => s.group === groupId);
}

export function toolTestSuitesForRunAll(): ToolTestSuite[] {
  return TOOL_TEST_SUITES.filter((s) => !s.interactive);
}
