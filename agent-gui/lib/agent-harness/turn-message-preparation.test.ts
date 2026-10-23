import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AgentUIMessage } from "@/lib/chat-types";
import { prepareTurnMessagesForModel } from "./turn-message-preparation";

function textMessage(
  id: string,
  role: "user" | "assistant",
  text: string,
): AgentUIMessage {
  return { id, role, parts: [{ type: "text", text }] };
}

describe("prepareTurnMessagesForModel", () => {
  it("expands only the latest user's slash command without rewriting historical commands", () => {
    const messages = [
      textMessage("u1", "user", "普通消息"),
      textMessage("a1", "assistant", "收到"),
      textMessage("u2", "user", "/old-review legacy"),
      textMessage("u3", "user", "/review src"),
      textMessage("a2", "assistant", "existing assistant content"),
    ];

    const result = prepareTurnMessagesForModel({
      messages,
      expandedSlashUserText: "<command-message name=\"review\">检查代码</command-message>",
    });

    assert.equal(result[0].parts[0].type, "text");
    assert.equal(result[2].parts[0].type, "text");
    assert.equal(result[3].parts[0].type, "text");
    if (
      result[0].parts[0].type !== "text"
      || result[2].parts[0].type !== "text"
      || result[3].parts[0].type !== "text"
    ) {
      assert.fail("expected text parts");
    }
    assert.equal(result[0].parts[0].text, "普通消息");
    assert.equal(
      result[3].parts[0].text,
      "<command-message name=\"review\">检查代码</command-message>",
    );
    assert.equal(result[2].parts[0].text, "/old-review legacy");
    assert.equal(result[4], messages[4]);
    assert.equal(messages[2].parts[0].type, "text");
    if (messages[2].parts[0].type === "text") {
      assert.equal(messages[2].parts[0].text, "/old-review legacy");
    }
  });

  it("does not apply a stale expansion to an older slash when the latest user text is ordinary", () => {
    const messages = [
      textMessage("u1", "user", "/old-command src"),
      textMessage("u2", "user", "continue normally"),
    ];
    const result = prepareTurnMessagesForModel({ messages, expandedSlashUserText: "stale expansion" });
    assert.deepEqual(result, messages);
  });

  it("expands one text part in the latest user message and preserves its other parts", () => {
    const messages: AgentUIMessage[] = [
      textMessage("u1", "user", "/old-command src"),
      { id: "u2", role: "user", parts: [
        { type: "text", text: "/review src" },
        { type: "text", text: "extra context" },
        { type: "file", url: "https://example.test/input.png", mediaType: "image/png" },
      ] },
    ];
    const result = prepareTurnMessagesForModel({ messages, expandedSlashUserText: "expanded latest command" });
    assert.deepEqual(result[0], messages[0]);
    assert.deepEqual(result[1].parts[0], { type: "text", text: "expanded latest command" });
    assert.deepEqual(result[1].parts[1], messages[1].parts[1]);
    assert.equal(result[1].parts[2], messages[1].parts[2]);
    assert.deepEqual(messages[1].parts[0], { type: "text", text: "/review src" });
  });

  it("leaves assistant-only history unchanged", () => {
    const messages = [textMessage("a1", "assistant", "/review src")];
    assert.deepEqual(prepareTurnMessagesForModel({
      messages, expandedSlashUserText: "unused expansion",
    }), messages);
  });

  it("expands Quicker action markup when no slash command is present", () => {
    const result = prepareTurnMessagesForModel({
      messages: [
        textMessage(
          "u1",
          "user",
          '<qkrpc-action-tag data-id="action-1" data-title="示例"></qkrpc-action-tag> 请检查',
        ),
      ],
    });

    const part = result[0].parts[0];
    assert.equal(part.type, "text");
    if (part.type !== "text") assert.fail("expected text part");
    assert.match(part.text, /<qka/);
    assert.match(part.text, /action-1/);
    assert.match(part.text, /请检查/);
  });
});
