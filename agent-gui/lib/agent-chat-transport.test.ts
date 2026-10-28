import assert from "node:assert/strict";
import { test } from "node:test";
import { createAgentChatTransport, type AgentChatTransportRefs } from "./agent-chat-transport";
import { resolveEnabledToolsForChatMode } from "./chat-mode";

test("the SDK transport preserves the wire choice before server mode filtering", async () => {
  const previous = globalThis.fetch;
  const bodies: Array<{ enabledTools: string[]; chatMode: string }> = [];
  globalThis.fetch = async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response('data: {"type":"start","messageId":"fixture"}\n\ndata: {"type":"finish"}\n\ndata: [DONE]\n\n', {
      headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" },
    });
  };
  const refs: AgentChatTransportRefs = { threadId: "fixture", chatMode: { current: "ask" }, enabledTools: { current: ["Shell"] },
    llmSelection: { current: "fixture" }, workingDirectory: { current: "fixture" }, titleManual: { current: true },
    designerEmbedScoped: { current: false }, actionDesigner: { current: undefined } };
  const transport = createAgentChatTransport(refs);
  try {
    for (const selected of [["Shell"], [], ["Read"]]) {
      refs.enabledTools.current = selected;
      const stream = await transport.sendMessages({ trigger: "submit-message", chatId: "fixture", messages: [], abortSignal: undefined });
      const reader = stream.getReader();
      while (!(await reader.read()).done) { /* consume the owned SDK stream */ }
      reader.releaseLock();
    }
    assert.deepEqual(bodies.map(body => body.enabledTools), [["Shell"], [], ["Read"]]);
    assert.ok(bodies.every(body => body.chatMode === "ask"));
    assert.deepEqual(resolveEnabledToolsForChatMode("ask", bodies[0].enabledTools, () => ["Read"]), [],
      "An ineligible built-in choice is narrowed by the server, not rewritten into the wire disable-all sentinel");
  } finally { globalThis.fetch = previous; }
});
