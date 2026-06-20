import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CHAT_MODE_AGENT } from "@/lib/chat-mode";
import {
  AGENT_ARTIFACT_DIR,
  buildToolExecutionContext,
  toolExecutionContextToAgentRequest,
} from "./tool-execution-context";

describe("tool-execution-context", () => {
  it("buildToolExecutionContext sets artifactDir and optional threadId", () => {
    const ctx = buildToolExecutionContext({
      cwd: "/ws",
      chatMode: CHAT_MODE_AGENT,
      actionScope: { pinnedLatest: undefined, pinnedLatestAll: [] },
      threadId: "thread-1",
      lastUserText: "hello",
    });

    assert.equal(ctx.artifactDir, AGENT_ARTIFACT_DIR);
    assert.equal(ctx.threadId, "thread-1");
    assert.equal(ctx.cwd, "/ws");
  });

  it("toolExecutionContextToAgentRequest maps ALS fields", () => {
    const ctx = buildToolExecutionContext({
      cwd: "/ws",
      chatMode: CHAT_MODE_AGENT,
      actionScope: { pinnedLatest: undefined, pinnedLatestAll: [] },
      threadId: "t1",
    });
    const als = toolExecutionContextToAgentRequest(ctx);
    assert.equal(als.threadId, "t1");
    assert.equal(als.artifactDir, AGENT_ARTIFACT_DIR);
  });
});
