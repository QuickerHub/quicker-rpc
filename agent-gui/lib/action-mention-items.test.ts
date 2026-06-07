import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatMentionItemMeta,
  parseActionMentionItemsFromQkrpcJson,
} from "@/lib/action-mention-items";

describe("action-mention-items", () => {
  it("parses merged action and subprogram rows with icons", () => {
    const items = parseActionMentionItemsFromQkrpcJson({
      payload: {
        items: [
          {
            kind: "action",
            actionId: "a1",
            title: "Clip Action",
            icon: "fa:Light_Clipboard",
            score: 90,
          },
          {
            kind: "subprogram",
            subProgramId: "sp1",
            title: "QuickerRpc_Run",
            callIdentifier: "QuickerRpc_Run",
            icon: "fa:Light_Code",
            score: 80,
          },
        ],
      },
    });

    assert.equal(items.length, 2);
    assert.equal(items[0]?.kind, "action");
    assert.equal(items[0]?.icon, "fa:Light_Clipboard");
    assert.equal(items[1]?.kind, "subprogram");
    assert.equal(items[1]?.callIdentifier, "QuickerRpc_Run");
    assert.equal(items[1]?.icon, "fa:Light_Code");
  });

  it("sorts by score when present", () => {
    const items = parseActionMentionItemsFromQkrpcJson({
      payload: {
        items: [
          { kind: "action", actionId: "a1", title: "B", score: 10 },
          { kind: "subprogram", subProgramId: "s1", title: "A", score: 50 },
        ],
      },
    });

    assert.equal(items[0]?.title, "A");
    assert.equal(items[1]?.title, "B");
  });

  it("formats subprogram meta with call identifier", () => {
    const meta = formatMentionItemMeta({
      kind: "subprogram",
      id: "sp1",
      title: "Run",
      callIdentifier: "QuickerRpc_Run",
    });
    assert.match(meta ?? "", /公共子程序/);
    assert.match(meta ?? "", /QuickerRpc_Run/);
  });
});
