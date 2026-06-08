import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AgentUIMessage } from "@/lib/chat-types";
import { formatLocalToolResult } from "@/lib/tool-result";
import {
  collectActionLinkBarIdsFromTurn,
  findLastSuccessfulActionPatchInTurn,
  resolveTurnActionLinkFallback,
} from "./turn-action-link";

const ACTION_ID = "9101812a-7f29-4e37-9c0c-3cd01f3bac01";

function patchPart(input: Record<string, unknown>, ok = true) {
  return {
    type: "tool-workspace_program_patch" as const,
    toolCallId: "tc-patch",
    state: "output-available" as const,
    input,
    output: formatLocalToolResult(
      {
        action: "action-save",
        success: ok,
        actionId: ACTION_ID,
        editVersion: 3,
      },
      ok,
      ok ? undefined : "failed",
    ),
  };
}

describe("turn-action-link", () => {
  it("finds last successful action patch in turn", () => {
    const firstId = "846b4132-ad73-42e8-b2f9-c42fe718ae20";
    const messages: AgentUIMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "新建动作" }] },
      {
        id: "a1",
        role: "assistant",
        parts: [
          patchPart({ target: "action", id: firstId }),
          patchPart({ target: "action", id: ACTION_ID }),
        ],
      },
    ];

    assert.deepEqual(findLastSuccessfulActionPatchInTurn(messages), {
      actionId: ACTION_ID,
    });
  });

  it("ignores global_subprogram patch", () => {
    const messages: AgentUIMessage[] = [
      {
        id: "a1",
        role: "assistant",
        parts: [
          patchPart({ target: "global_subprogram", id: "b6dd77fd-4578-47f7-acfb-c11f90122b74" }),
        ],
      },
    ];
    assert.equal(findLastSuccessfulActionPatchInTurn(messages), null);
  });

  it("builds default card links when model omitted qka-link", () => {
    const messages: AgentUIMessage[] = [
      {
        id: "a1",
        role: "assistant",
        parts: [
          patchPart({ target: "action", id: ACTION_ID }),
          { type: "text", text: "已完成剪贴板去重排序动作。" },
        ],
      },
    ];

    const links = resolveTurnActionLinkFallback(messages);
    assert.ok(links);
    assert.equal(links!.length, 4);
    assert.deepEqual(
      links!.map((row) => row.op),
      ["run", "edit", "float", "workspace"],
    );
    assert.equal(links![0]?.actionId, ACTION_ID);
  });

  it("skips fallback when assistant already emitted qka-link for same action", () => {
    const messages: AgentUIMessage[] = [
      {
        id: "a1",
        role: "assistant",
        parts: [
          patchPart({ target: "action", id: ACTION_ID }),
          {
            type: "text",
            text: `Done.\n<qka-link id="${ACTION_ID}" use="run,edit"/>`,
          },
        ],
      },
    ];

    assert.equal(resolveTurnActionLinkFallback(messages), null);
    assert.equal(collectActionLinkBarIdsFromTurn(messages).has(ACTION_ID), true);
  });

  it("returns null when patch failed", () => {
    const messages: AgentUIMessage[] = [
      {
        id: "a1",
        role: "assistant",
        parts: [patchPart({ target: "action", id: ACTION_ID }, false)],
      },
    ];
    assert.equal(resolveTurnActionLinkFallback(messages), null);
  });

  it("still shows card when assistant emitted inline qka ref", () => {
    const messages: AgentUIMessage[] = [
      {
        id: "a1",
        role: "assistant",
        parts: [
          patchPart({ target: "action", id: ACTION_ID }),
          {
            type: "text",
            text: `Done. <qka id="${ACTION_ID}">Test</qka>`,
          },
        ],
      },
    ];

    const links = resolveTurnActionLinkFallback(messages);
    assert.ok(links);
    assert.equal(links![0]?.actionId, ACTION_ID);
    assert.equal(collectActionLinkBarIdsFromTurn(messages).has(ACTION_ID), false);
  });

  it("reads action id from qkrpc apply output shape", () => {
    const messages: AgentUIMessage[] = [
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-workspace_program" as const,
            toolCallId: "tc-patch",
            state: "output-available" as const,
            input: { action: "patch", target: "action", id: ACTION_ID },
            output: formatLocalToolResult(
              {
                ok: true,
                actionId: ACTION_ID,
                editVersion: 4,
              },
              true,
            ),
          },
        ],
      },
    ];

    assert.deepEqual(findLastSuccessfulActionPatchInTurn(messages), {
      actionId: ACTION_ID,
    });
  });
});
