import { MockLanguageModelV3 } from "ai/test";
import { buildAgentRuntimeSnapshot } from "@/lib/agent-runtime-snapshot";
import { buildToolExecutionContext } from "./tool-execution-context";
import type { ResolvedAgentTurnRequest } from "./turn-request.server";
import type { PreparedAgentTurnRuntime } from "./turn-runtime.server";

/** Synthetic fixtures only: no model configuration, persistent store or host connection. */
export function syntheticTurn() {
  const messages: ResolvedAgentTurnRequest["repairedMessages"] = [
    { id: "user-fixture", role: "user", parts: [{ type: "text", text: "hello" }] },
  ];
  const request: ResolvedAgentTurnRequest = {
    body: { messages }, chatMode: "agent", cwd: "fixture-workspace",
    repairedMessages: messages, messagesForModel: messages,
    titleTest: false, benchMode: true, enabledToolIds: [],
    slashCommand: { expandedUserText: null, overrides: {}, commandName: null },
    selection: { kind: "profile", profileId: "fixture", modelId: "fixture" },
    lastUserText: "hello", threadId: "fixture-thread",
  };
  const actionScope = { pinnedLatestAll: [] };
  const scope = { actionScope, toolExecutionContext: buildToolExecutionContext({
    cwd: request.cwd, chatMode: request.chatMode, actionScope,
  }) };
  const model = new MockLanguageModelV3();
  const runtime: PreparedAgentTurnRuntime = {
    model, modelId: "fixture", contextLimit: 128_000, tools: {},
    chatMode: "agent", titleTest: false, selection: request.selection,
    compressionBase: { messages, model, contextLimit: 128_000 },
    preparedContext: { modelMessages: [{ role: "user", content: "hello" }], compressed: false },
    buildSystemForPreparedContext: () => "fixture system",
    runtimeSnapshot: buildAgentRuntimeSnapshot({
      actionScope, chatMode: "agent", enabledToolIds: [], messages, userText: "hello",
    }),
    dispose: async () => {},
  };
  return { request, scope, model, runtime };
}
