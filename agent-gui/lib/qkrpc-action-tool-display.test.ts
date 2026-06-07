import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatQkrpcActionCommandResultMeta,
  normalizeQkrpcActionInput,
  qkrpcActionCommandDisplayName,
  resolveQkrpcActionRunMode,
  QKRPC_ACTION_TOOL,
} from "./qkrpc-action-tool.ts";

describe("qkrpc action command display", () => {
  it("shows debug label for debug action", () => {
    const input = {
      action: "debug",
      id: "05102bf0-aaaa-bbbb-cccc-dddddddddddd",
    };
    assert.equal(qkrpcActionCommandDisplayName(QKRPC_ACTION_TOOL, input), "调试");
    assert.equal(resolveQkrpcActionRunMode(input), "debug");
    assert.equal(
      formatQkrpcActionCommandResultMeta(QKRPC_ACTION_TOOL, input, {
        ok: true,
        action: "trace",
        actionTitle: "文件词频统计",
        eventCount: 12,
        durationMs: 340,
        message: "trace finished",
      }),
      "文件词频统计 · 12 步 · 340ms",
    );
  });

  it("normalizes legacy trace action into debug", () => {
    const legacy = {
      action: "trace",
      id: "05102bf0-aaaa-bbbb-cccc-dddddddddddd",
    };
    assert.deepEqual(normalizeQkrpcActionInput(legacy), {
      action: "debug",
      id: legacy.id,
    });
    assert.equal(resolveQkrpcActionRunMode(legacy), "debug");
  });

  it("normalizes legacy run+trace flag into debug action", () => {
    const legacy = {
      action: "run",
      id: "05102bf0-aaaa-bbbb-cccc-dddddddddddd",
      trace: true,
    };
    assert.deepEqual(normalizeQkrpcActionInput(legacy), {
      action: "debug",
      id: legacy.id,
    });
    assert.equal(resolveQkrpcActionRunMode(legacy), "debug");
  });

  it("infers debug label from tool output when input is plain run", () => {
    const input = {
      action: "run",
      id: "81a84d3f-6397-48e3-9e75-6a03ecc7dbb0",
    };
    const data = {
      ok: true,
      action: "trace",
      actionTitle: "URL 列表行数统计",
      eventCount: 31,
      durationMs: 35,
      events: [{ kind: "step" }],
    };
    assert.equal(resolveQkrpcActionRunMode(input, data), "debug");
    assert.equal(
      qkrpcActionCommandDisplayName(QKRPC_ACTION_TOOL, input, data),
      "调试",
    );
    assert.equal(
      formatQkrpcActionCommandResultMeta(QKRPC_ACTION_TOOL, input, data),
      "URL 列表行数统计 · 31 步 · 35ms",
    );
  });

  it("prefers action title over guid in summary", () => {
    assert.equal(
      formatQkrpcActionCommandResultMeta(
        QKRPC_ACTION_TOOL,
        { action: "edit", id: "05102bf0-aaaa-bbbb-cccc-dddddddddddd" },
        {
          ok: true,
          action: "edit",
          actionId: "05102bf0-aaaa-bbbb-cccc-dddddddddddd",
          actionTitle: "文件词频统计",
          message: "已在 Quicker 中打开编辑器",
        },
      ),
      "文件词频统计 · 已在 Quicker 中打开编辑器",
    );
  });
});
