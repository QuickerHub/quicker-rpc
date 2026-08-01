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
  it("expands only the slash command message", () => {
    const messages = [
      textMessage("u1", "user", "普通消息"),
      textMessage("a1", "assistant", "收到"),
      textMessage("u2", "user", "/review src"),
      textMessage("u3", "user", "/not-expanded later"),
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
      result[2].parts[0].text,
      "<command-message name=\"review\">检查代码</command-message>",
    );
    assert.equal(result[3].parts[0].text, "/not-expanded later");
    assert.equal(messages[2].parts[0].type, "text");
    if (messages[2].parts[0].type === "text") {
      assert.equal(messages[2].parts[0].text, "/review src");
    }
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
