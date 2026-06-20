import type { UIMessage } from "ai";

import type { ActionScopeHint } from "@/lib/action-scope";
import { extractActionScopeFromMessages } from "@/lib/action-scope";
import { CHAT_MODE_LAUNCHER, type ChatMode } from "@/lib/chat-mode";
import { buildAgentTurnState } from "@/lib/agent-turn-state";
import { filterEnabledToolsForTurn } from "@/lib/tool-intent-filter";
import { filterToolIdsForBenchMode } from "@/lib/bench-mode";
import { LIST_TOOLS_TOOL } from "@/lib/list-tools-tool";
import { pickChatTools } from "@/lib/tool-registry";
import {
  resolveActiveToolBundles,
  resolveFullSchemaToolIds,
  type ResolveActiveToolBundlesParams,
} from "@/lib/tool-bundles";
import { SET_THREAD_TITLE_TOOL } from "@/lib/thread-title-tool-messages";

export type SelectChatToolsParams = {
  chatMode: ChatMode;
  enabledToolIds: string[];
  titleTest: boolean;
  benchMode?: boolean;
  userText?: string;
  actionScope?: ActionScopeHint;
  actionDesigner?: { entityId: string; isSubProgram?: boolean };
};

export function resolveToolBundleContext(params: {
  chatMode: ChatMode;
  enabledToolIds: readonly string[];
  userText: string;
  actionScope: ActionScopeHint;
  actionDesigner?: { entityId: string; isSubProgram?: boolean };
}) {
  const turnState = buildAgentTurnState({
    actionScope: params.actionScope,
    chatMode: params.chatMode,
    enabledToolIds: params.enabledToolIds,
    userText: params.userText,
  });
  const bundleParams: ResolveActiveToolBundlesParams = {
    chatMode: params.chatMode,
    intent: turnState.intent,
    actionScope: params.actionScope,
    actionDesigner: params.actionDesigner,
  };
  return {
    turnState,
    activeBundles: resolveActiveToolBundles(bundleParams),
    fullSchemaToolIds: resolveFullSchemaToolIds(bundleParams),
  };
}

export function resolveFullSchemaToolIdsForTurn(
  params: SelectChatToolsParams & { actionScope: ActionScopeHint; userText: string },
): Set<string> {
  const { fullSchemaToolIds } = resolveToolBundleContext({
    chatMode: params.chatMode,
    enabledToolIds: params.enabledToolIds,
    userText: params.userText,
    actionScope: params.actionScope,
    actionDesigner: params.actionDesigner,
  });
  return fullSchemaToolIds;
}

export function selectChatToolsFromRegistry<T extends Record<string, unknown>>(
  allTools: T,
  params: SelectChatToolsParams,
): T {
  if (params.titleTest) {
    const titleTool = allTools[SET_THREAD_TITLE_TOOL];
    if (!titleTool) {
      throw new Error(`Missing tool definition: ${SET_THREAD_TITLE_TOOL}`);
    }
    return { [SET_THREAD_TITLE_TOOL]: titleTool } as unknown as T;
  }

  let enabledIds = params.enabledToolIds;
  if (params.benchMode) {
    enabledIds = filterToolIdsForBenchMode(enabledIds);
  }
  if (params.userText && params.actionScope) {
    const turnState = buildAgentTurnState({
      actionScope: params.actionScope,
      chatMode: params.chatMode,
      enabledToolIds: enabledIds,
      userText: params.userText,
    });
    enabledIds = filterEnabledToolsForTurn({
      chatMode: params.chatMode,
      enabledToolIds: enabledIds,
      intent: turnState.intent,
      actionScope: params.actionScope,
      actionDesigner: params.actionDesigner,
    });
  }

  return pickChatTools(allTools, enabledIds, [
    LIST_TOOLS_TOOL,
    ...(params.chatMode === CHAT_MODE_LAUNCHER ? [] : [SET_THREAD_TITLE_TOOL]),
  ]);
}

export type ResolveChatToolIdsParams = {
  chatMode: ChatMode;
  enabledToolIds: string[];
  titleTest?: boolean;
  benchMode?: boolean;
  userText: string;
  messages?: UIMessage[];
  actionScope?: ActionScopeHint;
  actionDesigner?: { entityId: string; isSubProgram?: boolean };
};

/** Mirrors /api/chat tool registration — sorted ids for assertions. */
export function resolveChatToolIdsFromRegistry(
  allTools: Record<string, unknown>,
  params: ResolveChatToolIdsParams,
): string[] {
  const actionScope =
    params.actionScope
    ?? (params.messages
      ? extractActionScopeFromMessages(params.messages)
      : { pinnedLatest: undefined, pinnedLatestAll: [] });

  const tools = selectChatToolsFromRegistry(allTools, {
    chatMode: params.chatMode,
    enabledToolIds: params.enabledToolIds,
    titleTest: params.titleTest ?? false,
    benchMode: params.benchMode ?? false,
    userText: params.userText,
    actionScope,
    actionDesigner: params.actionDesigner,
  });

  return Object.keys(tools).sort();
}

/** Build a minimal tool bag for unit tests (avoids importing server-only quickerTools). */
export function buildMockToolRegistry(ids: readonly string[]): Record<string, object> {
  const bag: Record<string, object> = {};
  for (const id of ids) {
    bag[id] = { mock: true };
  }
  if (!bag[LIST_TOOLS_TOOL]) {
    bag[LIST_TOOLS_TOOL] = { mock: true };
  }
  if (!bag[SET_THREAD_TITLE_TOOL]) {
    bag[SET_THREAD_TITLE_TOOL] = { mock: true };
  }
  return bag;
}
