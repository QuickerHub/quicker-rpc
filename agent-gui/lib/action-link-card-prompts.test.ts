import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildActionLinkCardPromptMessage } from "@/lib/action-link-card-prompts";
import { parseUserMessageSegments } from "@/lib/compose-user-message";

const ACTION_ID = "d47c98d1-86be-40d0-ad02-87103f4dda1e";
const TITLE = "选中文本→记事本";

describe("buildActionLinkCardPromptMessage", () => {
  it("uses qkrpc-action-tag markup for user prompts", () => {
    const message = buildActionLinkCardPromptMessage("move-panel", {
      actionId: ACTION_ID,
      title: TITLE,
    });
    assert.ok(message);
    assert.match(message, /请帮我放到指定面板或分组，目标是/);
    assert.ok(message!.startsWith("<qkrpc-action-tag"));
    assert.match(
      message,
      /<qkrpc-action-tag[^>]+data-id="d47c98d1-86be-40d0-ad02-87103f4dda1e"/,
    );
    assert.match(message, /data-title="选中文本→记事本"/);
    assert.doesNotMatch(message, /<qka-link/);

    const segments = parseUserMessageSegments(message);
    assert.equal(
      segments.some((s) => s.type === "tag" && s.action.title === TITLE),
      true,
    );
  });

  it("builds trace debug composer prompt with optional param", () => {
    const message = buildActionLinkCardPromptMessage("trace", {
      actionId: ACTION_ID,
      title: TITLE,
      param: "path=C:\\test.txt",
    });
    assert.ok(message);
    assert.match(message, /请 trace 调试运行动作，运行参数 path=C:\\test\.txt/);
    assert.match(message, /侧栏查看步骤时间线/);
  });
});
