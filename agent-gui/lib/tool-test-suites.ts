/** Predefined tool-call groups for the /tool-test page (read-only by default). */

export type ToolTestStep = {
  id: string;
  label: string;
  toolName: string;
  input: Record<string, unknown>;
};

export type ToolTestSuite = {
  id: string;
  title: string;
  description: string;
  steps: ToolTestStep[];
};

export const TOOL_TEST_SUITES: ToolTestSuite[] = [
  {
    id: "docs",
    title: "编写指南（本地）",
    description: "docs_index → docs_get overview，不经过 qkrpc",
    steps: [
      {
        id: "docs-index",
        label: "列出主题",
        toolName: "docs_index",
        input: {},
      },
      {
        id: "docs-overview",
        label: "overview 主题",
        toolName: "docs_get",
        input: { topic: "overview" },
      },
    ],
  },
  {
    id: "step-runner-search-control",
    title: "步骤搜索 · controlField",
    description:
      "非空 query 且命中控制项时，items[] 应带 controlField { key, value, name? }；表格与源码 Tab 可对照",
    steps: [
      {
        id: "search-move",
        label: "「移动」多模块 + controlField",
        toolName: "qkrpc_step_runner_search",
        input: { query: "移动", limit: 8 },
      },
      {
        id: "search-move-ex",
        label: "「move_ex」窗口增强",
        toolName: "qkrpc_step_runner_search",
        input: { query: "move_ex", limit: 5 },
      },
    ],
  },
  {
    id: "catalog-read",
    title: "目录只读（qkrpc）",
    description: "动作列表、步骤模块搜索、图标搜索",
    steps: [
      {
        id: "action-list",
        label: "列出动作",
        toolName: "qkrpc_action_list",
        input: { limit: 5 },
      },
      {
        id: "step-search",
        label: "搜索步骤模块",
        toolName: "qkrpc_step_runner_search",
        input: { query: "表达式", limit: 5 },
      },
      {
        id: "fa-search",
        label: "搜索图标",
        toolName: "qkrpc_fa_search",
        input: { query: "robot", limit: 5 },
      },
    ],
  },
  {
    id: "workspace-read",
    title: "工作区只读",
    description: "扫描 .quicker/actions 本地项目",
    steps: [
      {
        id: "projects",
        label: "动作项目",
        toolName: "workspace_action_projects",
        input: {},
      },
    ],
  },
  {
    id: "dev-check",
    title: "前端健康检查",
    description: "dev_frontend_check（开发模式）",
    steps: [
      {
        id: "frontend-check",
        label: "检查 dev 页面",
        toolName: "dev_frontend_check",
        input: { clearCaptured: false },
      },
    ],
  },
];

export function getToolTestSuite(id: string): ToolTestSuite | undefined {
  return TOOL_TEST_SUITES.find((s) => s.id === id);
}
