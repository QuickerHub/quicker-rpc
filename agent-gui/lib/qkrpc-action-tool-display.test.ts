import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatQkrpcActionCommandResultMeta,
  qkrpcActionCommandDisplayName,
  QKRPC_ACTION_TOOL,
} from "./qkrpc-action-tool.ts";

describe("qkrpc action command display", () => {
  it("shows user-facing labels for trace run", () => {
    const input = {
      action: "run",
      id: "05102bf0-aaaa-bbbb-cccc-dddddddddddd",
      trace: true,
    };
    assert.equal(qkrpcActionCommandDisplayName(QKRPC_ACTION_TOOL, input), "调试");
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
