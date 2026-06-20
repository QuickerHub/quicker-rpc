import { ALL_QKRPC_TOOL_IDS } from "@/lib/tool-registry";
import { TOOL_TEST_SUITES, type ToolTestSuite } from "@/lib/tool-test-suites";

/** Chat-only tools in quickerTools but not user-configurable in the picker. */
const CHAT_ONLY_TOOL_IDS = [
  "ask_question",
  "set_thread_title",
  "launcher_command_cache",
] as const;

/** Tools with no server execute — exercised only in chat UI. */
export const TOOL_TEST_UI_ONLY_TOOLS: ReadonlySet<string> = new Set([
  "ask_question",
  "set_thread_title",
  "launcher_command_cache",
]);

/** Side-effect tools — covered by manual / dedicated flows, not automated suites. */
export const TOOL_TEST_MANUAL_TOOLS: Readonly<
  Record<string, string>
> = {
  qkrpc_action_get: "同步会写 .quicker 磁盘",
  qkrpc_action_create: "会新建动作",
  qkrpc_designer_open: "会打开设计器",
  qkrpc_action_edit_var: "会修改变量",
  qkrpc_action_set_metadata: "会改元数据",
  qkrpc_action_move: "会移动动作格",
  qkrpc_action_publish: "会发布到 getquicker",
  qkrpc_action_run: "会运行动作",
  qkrpc_action_debug: "会调试动作",
  qkrpc_action_float: "会弹出悬浮运行",
  qkrpc_profile_create: "会新建动作页",
  qkrpc_profile_delete: "会删除动作页",
  qkrpc_profile_prune: "会清理空页",
  qkrpc_profile_reorder: "会重排动作页",
  qkrpc_process_ensure: "会改虚拟进程布局",
  qkrpc_subprogram_get: "会同步子程序到磁盘",
  qkrpc_subprogram_create: "会新建子程序",
  qkrpc_subprogram_transfer: "会导入/导出目录",
  qkrpc_action_delete: "危险删除 — 用「门闩」套件手测确认 UI",
  qkrpc_subprogram_delete: "危险删除 — 用「门闩」套件手测确认 UI",
};

export type ToolTestCoverageReport = {
  executableToolIds: string[];
  coveredToolIds: string[];
  uncoveredToolIds: string[];
  uiOnlyToolIds: string[];
  manualToolIds: string[];
  suiteCount: number;
  stepCount: number;
  ratio: number;
};

function collectCoveredToolIds(suites: readonly ToolTestSuite[]): Set<string> {
  const covered = new Set<string>();
  for (const suite of suites) {
    for (const step of suite.steps) {
      covered.add(step.toolName);
    }
  }
  return covered;
}

export function listExecutableToolIds(): string[] {
  return [...ALL_QKRPC_TOOL_IDS].sort();
}

export function computeToolTestCoverage(
  suites: readonly ToolTestSuite[] = TOOL_TEST_SUITES,
): ToolTestCoverageReport {
  const executableToolIds = listExecutableToolIds();
  const covered = collectCoveredToolIds(suites);
  const coveredToolIds = executableToolIds.filter((id) => covered.has(id));
  const manualToolIds = executableToolIds.filter(
    (id) => id in TOOL_TEST_MANUAL_TOOLS,
  );
  const uiOnlyToolIds = [...TOOL_TEST_UI_ONLY_TOOLS].sort();
  const uncoveredToolIds = executableToolIds.filter(
    (id) =>
      !covered.has(id)
      && !(id in TOOL_TEST_MANUAL_TOOLS)
      && !TOOL_TEST_UI_ONLY_TOOLS.has(id),
  );
  const stepCount = suites.reduce((n, s) => n + s.steps.length, 0);
  const automatable = executableToolIds.filter(
    (id) => !(id in TOOL_TEST_MANUAL_TOOLS) && !TOOL_TEST_UI_ONLY_TOOLS.has(id),
  );
  const ratio =
    automatable.length === 0
      ? 1
      : automatable.filter((id) => covered.has(id)).length / automatable.length;

  return {
    executableToolIds,
    coveredToolIds,
    uncoveredToolIds,
    uiOnlyToolIds,
    manualToolIds,
    suiteCount: suites.length,
    stepCount,
    ratio,
  };
}

export function chatOnlyToolIds(): string[] {
  return [...CHAT_ONLY_TOOL_IDS];
}
