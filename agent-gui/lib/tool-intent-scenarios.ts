import type { ActionScopeHint } from "@/lib/action-scope";
import type { ChatMode } from "@/lib/chat-mode";
import type { AgentTurnIntent } from "@/lib/agent-turn-state";

export type ToolIntentScenario = {
  id: string;
  description: string;
  chatMode: ChatMode;
  userText: string;
  intent: AgentTurnIntent;
  actionScope: ActionScopeHint;
  actionDesigner?: { entityId: string; isSubProgram?: boolean };
  /** Must not appear after filterEnabledToolsForTurn (unless always-on internal). */
  mustExclude: readonly string[];
  /** Must remain when present in the enabled pool. */
  mustInclude: readonly string[];
};

const emptyScope: ActionScopeHint = {
  pinnedLatest: undefined,
  pinnedLatestAll: [],
};

const pinnedActionScope: ActionScopeHint = {
  pinnedLatest: {
    id: "e0ac442e-6241-4f89-9a20-494dee157b89",
    source: "user-tag",
    title: "Demo",
  },
  pinnedLatestAll: [
    {
      id: "e0ac442e-6241-4f89-9a20-494dee157b89",
      source: "user-tag",
      title: "Demo",
    },
  ],
};

/** Table-driven scenarios for tool-intent filtering regression tests. */
export const TOOL_INTENT_SCENARIOS: readonly ToolIntentScenario[] = [
  {
    id: "authoring-text",
    description: "Authoring intent keeps all enabled tools",
    chatMode: "agent",
    userText: "帮我修改动作步骤并保存",
    intent: "action_authoring",
    actionScope: emptyScope,
    mustExclude: [],
    mustInclude: ["workspace_program", "docs", "browser", "web_search"],
  },
  {
    id: "pinned-action",
    description: "@-pinned action keeps browser and launcher tools",
    chatMode: "agent",
    userText: "继续",
    intent: "conversation",
    actionScope: pinnedActionScope,
    mustExclude: [],
    mustInclude: ["workspace_program", "qkrpc_action_run", "browser", "launcher_resolve"],
  },
  {
    id: "designer-embed",
    description: "Action Designer embed keeps dev and browser tools when enabled",
    chatMode: "agent",
    userText: "加一步提示框",
    intent: "conversation",
    actionScope: emptyScope,
    actionDesigner: { entityId: "e0ac442e-6241-4f89-9a20-494dee157b89" },
    mustExclude: [],
    mustInclude: ["workspace_program", "dev_frontend_check", "browser"],
  },
  {
    id: "runtime-non-web",
    description: "Run/debug intent keeps browser and web_search",
    chatMode: "agent",
    userText: "运行这个动作并看输出",
    intent: "action_runtime",
    actionScope: emptyScope,
    mustExclude: [],
    mustInclude: ["qkrpc_action_run", "qkrpc_action_float", "browser", "web_search"],
  },
  {
    id: "web-intent",
    description: "Web intent keeps browser and search tools",
    chatMode: "agent",
    userText: "打开 https://example.com 并抓取标题",
    intent: "web",
    actionScope: emptyScope,
    mustExclude: [],
    mustInclude: ["browser", "web_search"],
  },
  {
    id: "workspace-repo",
    description: "Repo editing keeps web tools when enabled",
    chatMode: "agent",
    userText: "在 agent-gui 代码里 grep tool-registry",
    intent: "workspace",
    actionScope: emptyScope,
    mustExclude: [],
    mustInclude: ["Grep", "Read", "browser", "web_search"],
  },
  {
    id: "conversation-open",
    description: "Generic chat does not apply intent exclusions",
    chatMode: "agent",
    userText: "你好，Quicker 是什么？",
    intent: "conversation",
    actionScope: emptyScope,
    mustExclude: [],
    mustInclude: ["browser", "web_search", "docs"],
  },
];
