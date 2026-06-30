import type { ActionScopeHint } from "@/lib/action-scope";
import type { AgentUIMessage } from "@/lib/chat-types";
import type { ChatMode } from "@/lib/chat-mode";
import { CHAT_MODE_ASK, CHAT_MODE_LAUNCHER } from "@/lib/chat-mode";
import {
  buildAgentTurnState,
  type AgentTurnRisk,
  type AgentTurnState,
} from "@/lib/agent-turn-state";
import {
  chooseRecoveryDecision,
  type AgentRecoveryDecision,
} from "@/lib/agent-recovery-policy";
import { collectRecentToolFeedback } from "@/lib/tool-feedback-context";
import {
  resolveActiveToolBundles,
  resolveFullSchemaToolIds,
  type ToolBundleId,
} from "@/lib/tool-bundles";
import type { ToolNextAction } from "@/lib/tool-result";

export type AgentIntent =
  | "conversation"
  | "workspace"
  | "web"
  | "quicker_runtime"
  | "quicker_authoring"
  | "quicker_settings"
  | "agent_config";

export type AgentRisk = AgentTurnRisk;

export type VerificationPolicy =
  | "none"
  | "explain_only"
  | "diagnostics"
  | "debug"
  | "test"
  | "ask_user";

export type TargetRef = {
  kind:
    | "action"
    | "global_subprogram"
    | "embedded_subprogram"
    | "workspace_path"
    | "web_page"
    | "setting"
    | "unknown";
  id?: string;
  label?: string;
  source: "mention" | "designer" | "history" | "user_text" | "tool_feedback";
};

export type TurnPlan = {
  mode: ChatMode;
  userText: string;
  intent: AgentIntent;
  legacyIntent: AgentTurnState["intent"];
  risk: AgentRisk;
  targets: TargetRef[];
  capabilityBundles: string[];
  activeToolBundles: ToolBundleId[];
  skillHints: string[];
  requiredToolIds: string[];
  fullSchemaToolIds: string[];
  slimToolIds: string[];
  blockedToolIds: string[];
  nextAction?: ToolNextAction;
  recoveryDecision: AgentRecoveryDecision;
  verificationPolicy: VerificationPolicy;
  systemHints: string[];
  turnState: AgentTurnState;
};

export type ResolveTurnPlanParams = {
  actionScope: ActionScopeHint;
  chatMode: ChatMode;
  enabledToolIds: readonly string[];
  messages: AgentUIMessage[];
  userText: string;
  actionDesigner?: { entityId: string; isSubProgram?: boolean };
};

function mapIntent(intent: AgentTurnState["intent"]): AgentIntent {
  switch (intent) {
    case "action_authoring":
      return "quicker_authoring";
    case "action_runtime":
      return "quicker_runtime";
    case "settings":
      return "quicker_settings";
    case "web":
      return "web";
    case "workspace":
      return "workspace";
    case "conversation":
      return "conversation";
  }
}

function capabilityBundlesFor(
  intent: AgentIntent,
  activeBundles: readonly ToolBundleId[],
): string[] {
  const out = new Set<string>();
  if (intent === "workspace") out.add("core.workspace");
  if (intent === "web") out.add("core.web");
  if (intent === "agent_config") out.add("core.agent_defs");
  if (
    intent === "quicker_runtime"
    || intent === "quicker_authoring"
    || intent === "quicker_settings"
  ) {
    out.add("qkrpc.runtime");
  }
  if (intent === "quicker_authoring") out.add("qkrpc.authoring");
  if (intent === "quicker_settings") out.add("qkrpc.settings");

  for (const bundle of activeBundles) {
    if (bundle === "browser") out.add("core.web");
    if (bundle === "settings") out.add("core.agent_config");
    if (bundle === "action_layout") out.add("qkrpc.layout");
    if (bundle === "destructive") out.add("qkrpc.destructive");
    if (bundle === "dev") out.add("agent.dev");
  }

  if (out.size === 0) out.add("core.chat");
  return [...out];
}

function targetsFromParams(params: ResolveTurnPlanParams): TargetRef[] {
  const targets: TargetRef[] = [];
  for (const ref of params.actionScope.pinnedLatestAll) {
    targets.push({
      kind: "action",
      id: ref.id,
      label: ref.title,
      source: "mention",
    });
  }
  if (params.actionDesigner?.entityId?.trim()) {
    targets.push({
      kind: params.actionDesigner.isSubProgram ? "global_subprogram" : "action",
      id: params.actionDesigner.entityId,
      source: "designer",
    });
  }
  return targets;
}

function blockedToolsForMode(mode: ChatMode, enabledToolIds: readonly string[]): string[] {
  if (mode !== CHAT_MODE_ASK) return [];
  return enabledToolIds.filter((id) =>
    id === "Shell"
    || id === "Write"
    || id === "StrReplace"
    || id === "workspace_program"
    || id.includes("_run")
    || id.includes("_debug")
    || id.includes("_delete")
    || id.includes("_create")
    || id.includes("_publish")
    || id.includes("_set_")
    || id.includes("_move")
  );
}

function verificationPolicyFor(params: {
  mode: ChatMode;
  intent: AgentIntent;
  risk: AgentRisk;
  recoveryDecision: AgentRecoveryDecision;
  nextAction?: ToolNextAction;
}): VerificationPolicy {
  if (params.recoveryDecision.kind === "ask_user") return "ask_user";
  if (params.mode === CHAT_MODE_ASK) return "explain_only";
  if (params.nextAction?.input?.action === "diagnostics") return "diagnostics";
  if (params.nextAction?.tool === "qkrpc_action_debug") return "debug";
  if (params.intent === "quicker_authoring") return "diagnostics";
  if (params.intent === "quicker_runtime") return "debug";
  if (params.intent === "workspace" && params.risk === "write") return "test";
  return "none";
}

function requiredToolsFor(params: {
  nextAction?: ToolNextAction;
  recommendedToolIds: readonly string[];
}): string[] {
  const out = new Set<string>();
  if (params.nextAction?.priority === "required") {
    out.add(params.nextAction.tool);
  }
  for (const id of params.recommendedToolIds) out.add(id);
  return [...out];
}

export function resolveTurnPlan(params: ResolveTurnPlanParams): TurnPlan {
  const turnState = buildAgentTurnState({
    actionScope: params.actionScope,
    chatMode: params.chatMode,
    enabledToolIds: params.enabledToolIds,
    userText: params.userText,
  });
  const intent = mapIntent(turnState.intent);
  const bundleParams = {
    chatMode: params.chatMode,
    intent: turnState.intent,
    actionScope: params.actionScope,
    actionDesigner: params.actionDesigner,
  };
  const activeToolBundles = resolveActiveToolBundles(bundleParams);
  const fullSchemaToolIds = [...resolveFullSchemaToolIds(bundleParams)];
  const recentToolFeedback = collectRecentToolFeedback(params.messages);
  const recoveryDecision = chooseRecoveryDecision(recentToolFeedback);
  const nextAction =
    recoveryDecision.kind === "next_action" ? recoveryDecision.action : undefined;
  const verificationPolicy = verificationPolicyFor({
    mode: params.chatMode,
    intent,
    risk: turnState.risk,
    recoveryDecision,
    nextAction,
  });

  return {
    mode: params.chatMode,
    userText: params.userText,
    intent,
    legacyIntent: turnState.intent,
    risk: turnState.risk,
    targets: targetsFromParams(params),
    capabilityBundles: capabilityBundlesFor(intent, activeToolBundles),
    activeToolBundles,
    skillHints: [],
    requiredToolIds: requiredToolsFor({
      nextAction,
      recommendedToolIds: turnState.recommendedToolIds,
    }),
    fullSchemaToolIds,
    slimToolIds: params.enabledToolIds.filter((id) => !fullSchemaToolIds.includes(id)),
    blockedToolIds: blockedToolsForMode(params.chatMode, params.enabledToolIds),
    nextAction,
    recoveryDecision,
    verificationPolicy,
    systemHints: turnState.verificationHints,
    turnState,
  };
}
