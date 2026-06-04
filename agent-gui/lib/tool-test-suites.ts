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
      "单词/短语 query：非空时带 controlField、rankBias 对照。组合语法（OR|、通配 *）见下一卡片",
    steps: [
      {
        id: "search-move",
        label: "移动",
        toolName: "qkrpc_step_runner_search",
        input: { query: "移动", limit: 10 },
      },
      {
        id: "search-move-window-plain",
        label: "移动窗口",
        toolName: "qkrpc_step_runner_search",
        input: { query: "移动窗口", limit: 5 },
      },
      {
        id: "search-move-window-ex",
        label: "移动窗口增强",
        toolName: "qkrpc_step_runner_search",
        input: { query: "移动窗口增强", limit: 5 },
      },
      {
        id: "search-move-ex-token",
        label: "move_ex",
        toolName: "qkrpc_step_runner_search",
        input: { query: "move_ex", limit: 5 },
      },
      {
        id: "search-copy-file",
        label: "复制文件",
        toolName: "qkrpc_step_runner_search",
        input: { query: "复制文件", limit: 5 },
      },
      {
        id: "search-delete-file",
        label: "删除文件",
        toolName: "qkrpc_step_runner_search",
        input: { query: "删除文件", limit: 5 },
      },
      {
        id: "search-move-file",
        label: "移动文件",
        toolName: "qkrpc_step_runner_search",
        input: { query: "移动文件", limit: 5 },
      },
      {
        id: "search-mouse-click",
        label: "鼠标点击",
        toolName: "qkrpc_step_runner_search",
        input: { query: "鼠标点击", limit: 6 },
      },
      {
        id: "search-list-append",
        label: "添加",
        toolName: "qkrpc_step_runner_search",
        input: { query: "添加", limit: 8 },
      },
      {
        id: "search-script-ps",
        label: "powershell",
        toolName: "qkrpc_step_runner_search",
        input: { query: "powershell", limit: 6 },
      },
      {
        id: "search-expression",
        label: "表达式",
        toolName: "qkrpc_step_runner_search",
        input: { query: "表达式", limit: 8 },
      },
      {
        id: "search-replace-text",
        label: "替换文本",
        toolName: "qkrpc_step_runner_search",
        input: { query: "替换文本", limit: 6 },
      },
      {
        id: "search-empty-query",
        label: "空 query",
        toolName: "qkrpc_step_runner_search",
        input: { query: "", limit: 6 },
      },
    ],
  },
  {
    id: "step-runner-search-combined",
    title: "步骤搜索 · 组合 query",
    description:
      "高级语法：OR (a|b)、通配 (*clip*、sys:mouse*)、AND (空格)。结果里核对 controlField 与排序",
    steps: [
      {
        id: "search-or-expr",
        label: "OR 表达式|eval",
        toolName: "qkrpc_step_runner_search",
        input: { query: "表达式|evalexpression", limit: 8 },
      },
      {
        id: "search-or-move-mouse",
        label: "OR 移动窗口|鼠标点击",
        toolName: "qkrpc_step_runner_search",
        input: { query: "移动窗口|鼠标点击", limit: 8 },
      },
      {
        id: "search-or-file-ops",
        label: "OR 复制文件|删除文件",
        toolName: "qkrpc_step_runner_search",
        input: { query: "复制文件|删除文件", limit: 8 },
      },
      {
        id: "search-and-move-window",
        label: "AND 移动 窗口",
        toolName: "qkrpc_step_runner_search",
        input: { query: "移动 窗口", limit: 8 },
      },
      {
        id: "search-wild-clip",
        label: "通配 *clip*",
        toolName: "qkrpc_step_runner_search",
        input: { query: "*clip*", limit: 10 },
      },
      {
        id: "search-wild-sys-mouse",
        label: "通配 sys:mouse*",
        toolName: "qkrpc_step_runner_search",
        input: { query: "sys:mouse*", limit: 10 },
      },
      {
        id: "search-or-expr-wild",
        label: "OR+通配 表达式|*eval*",
        toolName: "qkrpc_step_runner_search",
        input: { query: "表达式|*eval*", limit: 8 },
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
