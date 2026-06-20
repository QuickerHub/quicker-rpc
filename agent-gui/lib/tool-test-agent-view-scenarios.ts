import { BROWSER_TOOL } from "@/lib/browser-tool-constants";
import { GREP_TOOL, SHELL_TOOL, WRITE_TOOL } from "@/lib/host-tool-constants";
import { DOCS_TOOL } from "@/lib/docs-tool";
import {
  QKRPC_ACTION_DEBUG_TOOL,
  QKRPC_ACTION_GET_TOOL,
  QKRPC_ACTION_QUERY_TOOL,
} from "@/lib/qkrpc-action-tool";
import {
  QKRPC_SUBPROGRAM_GET_TOOL,
  QKRPC_SUBPROGRAM_QUERY_TOOL,
} from "@/lib/qkrpc-subprogram-tool";
import { WEB_SEARCH_TOOL } from "@/lib/web-search-tool-constants";
import { WORKSPACE_PROGRAM_TOOL } from "@/lib/workspace-program-tool";
import { AGENT_PAYLOAD_SOFT_CHARS } from "@/lib/tool-result-agent-view";
import { formatLocalToolResult } from "@/lib/tool-result";

export type AgentViewScenario = {
  id: string;
  label: string;
  description: string;
  toolName: string;
  input: Record<string, unknown>;
  buildRaw: () => Record<string, unknown>;
};

export const AGENT_VIEW_SCENARIOS: AgentViewScenario[] = [
  {
    id: "shell-large",
    label: "Shell 大输出",
    description: "长 stdout → Shell artifact（L1 裁剪默认关）",
    toolName: SHELL_TOOL,
    input: { description: "test", command: "echo x" },
    buildRaw: () => formatLocalToolResult({
      commandLine: "echo x",
      output: "x".repeat(AGENT_PAYLOAD_SOFT_CHARS + 500),
    }),
  },
  {
    id: "write-large",
    label: "Write 大 content",
    description: "写入结果不含 content echo",
    toolName: WRITE_TOOL,
    input: { path: ".local/out.txt", content: "y".repeat(AGENT_PAYLOAD_SOFT_CHARS + 400) },
    buildRaw: () => formatLocalToolResult({
      action: "file-write",
      success: true,
      path: ".local/out.txt",
      bytesWritten: AGENT_PAYLOAD_SOFT_CHARS + 400,
      content: "y".repeat(AGENT_PAYLOAD_SOFT_CHARS + 400),
      previousContent: "",
    }),
  },
  {
    id: "grep-many",
    label: "Grep 多行长匹配",
    description: "24 条返回 / 80 总命中 · 6 文件合并",
    toolName: GREP_TOOL,
    input: { pattern: "foo" },
    buildRaw: () => formatLocalToolResult({
      action: "grep",
      success: true,
      pattern: "foo",
      searchPath: ".",
      outputMode: "content",
      matches: Array.from({ length: 24 }, (_, i) => ({
        path: `f-${Math.floor(i / 4)}.ts`,
        hits: [{
          line: i,
          content: "hit ".repeat(180),
        }],
      })),
      truncated: true,
      totalMatches: 80,
    }),
  },
  {
    id: "docs-get-full",
    label: "docs get 全文",
    description: "markdown 预览",
    toolName: DOCS_TOOL,
    input: { action: "get", topic: "authoring-workflow" },
    buildRaw: () => formatLocalToolResult({
      action: "docs-get",
      docsAction: "get",
      success: true,
      mode: "full",
      topic: "authoring-workflow",
      title: "Workflow",
      markdown: `# H\n${"line ".repeat(4000)}`,
    }),
  },
  {
    id: "debug-trace",
    label: "debug trace",
    description: "events → traceWindow",
    toolName: QKRPC_ACTION_DEBUG_TOOL,
    input: { id: "00000000-0000-0000-0000-000000000001" },
    buildRaw: () => formatLocalToolResult({
      ok: false,
      eventCount: 12,
      events: Array.from({ length: 12 }, (_, i) => ({
        kind: i === 10 ? "error" : "step_begin",
        stepRunnerName: `step-${i}`,
        message: i === 10 ? "failed" : undefined,
        depth: 0,
      })),
      failureLocation: { dataJsonPointer: "/steps/2" },
    }, false),
  },
  {
    id: "action-get-steps",
    label: "action get steps",
    description: "stepSummaries 替代全量 steps",
    toolName: QKRPC_ACTION_GET_TOOL,
    input: { action: "get", id: "00000000-0000-0000-0000-000000000099" },
    buildRaw: () => {
      const raw = formatLocalToolResult({
        ok: true,
        payload: {
          actionId: "00000000-0000-0000-0000-000000000099",
          title: "Demo",
          steps: Array.from({ length: 70 }, (_, i) => ({
            stepRunnerKey: "sys:assign",
            stepId: `s-${i}`,
            inputParams: { v: "x".repeat(400) },
          })),
        },
      }, true);
      raw.source = "qkrpc";
      return raw;
    },
  },
  {
    id: "action-query-list",
    label: "action query",
    description: "items 精简 + cap",
    toolName: QKRPC_ACTION_QUERY_TOOL,
    input: { limit: 50 },
    buildRaw: () => {
      const raw = formatLocalToolResult({
        ok: true,
        payload: {
          items: Array.from({ length: 55 }, (_, i) => ({
            actionId: `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
            title: `A${i}`,
            description: "d".repeat(180),
          })),
          matchCount: 55,
        },
      }, true);
      raw.source = "qkrpc";
      return raw;
    },
  },
  {
    id: "subprogram-get",
    label: "subprogram get",
    description: "与 action get 相同 step 摘要",
    toolName: QKRPC_SUBPROGRAM_GET_TOOL,
    input: { action: "get", id: "demo-sub" },
    buildRaw: () => {
      const raw = formatLocalToolResult({
        ok: true,
        payload: {
          subProgramId: "demo-sub",
          name: "Demo Sub",
          steps: Array.from({ length: 60 }, (_, i) => ({
            stepRunnerKey: "sys:comment",
            stepId: `sp-${i}`,
            inputParams: { note: "n".repeat(300) },
          })),
        },
      }, true);
      raw.source = "qkrpc";
      return raw;
    },
  },
  {
    id: "subprogram-query",
    label: "subprogram query",
    description: "子程序列表精简",
    toolName: QKRPC_SUBPROGRAM_QUERY_TOOL,
    input: { query: "demo" },
    buildRaw: () => {
      const raw = formatLocalToolResult({
        ok: true,
        payload: {
          items: Array.from({ length: 50 }, (_, i) => ({
            subProgramId: `sp-${i}`,
            name: `Sub ${i}`,
            description: "x".repeat(160),
          })),
          matchCount: 50,
        },
      }, true);
      raw.source = "qkrpc";
      return raw;
    },
  },
  {
    id: "web-search",
    label: "web_search",
    description: "results snippet 截断",
    toolName: WEB_SEARCH_TOOL,
    input: { query: "quicker rpc", limit: 8 },
    buildRaw: () => formatLocalToolResult({
      action: "web-search",
      success: true,
      query: "quicker rpc",
      provider: "duckduckgo",
      results: Array.from({ length: 8 }, (_, i) => ({
        title: `Result ${i}`,
        url: `https://example.com/${i}`,
        snippet: "snippet ".repeat(120),
      })),
    }),
  },
  {
    id: "browser-snapshot",
    label: "browser snapshot",
    description: "snapshot 大文本压缩",
    toolName: BROWSER_TOOL,
    input: { action: "snapshot" },
    buildRaw: () => formatLocalToolResult({
      action: "snapshot",
      nodeCount: 128,
      snapshot: "- button Submit\n".repeat(1200),
    }),
  },
  {
    id: "workspace-read",
    label: "workspace_program read",
    description: "data.json content 预览",
    toolName: WORKSPACE_PROGRAM_TOOL,
    input: {
      action: "read_data",
      target: "action",
      id: "00000000-0000-0000-0000-000000000002",
    },
    buildRaw: () => formatLocalToolResult({
      action: "program-data-read",
      success: true,
      path: "data.json",
      content: "{".repeat(AGENT_PAYLOAD_SOFT_CHARS + 300),
      totalChars: AGENT_PAYLOAD_SOFT_CHARS + 300,
    }),
  },
];

export function getAgentViewScenario(id: string): AgentViewScenario | undefined {
  return AGENT_VIEW_SCENARIOS.find((scenario) => scenario.id === id);
}
