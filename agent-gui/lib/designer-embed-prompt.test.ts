import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  formatDesignerEmbedContextForSystem,
  mergeDesignerDefaultActionScope,
  parseActionDesignerChatContext,
  resolveActionDesignerForChatTurn,
} from "@/lib/designer-embed-prompt";

describe("designer-embed-prompt", () => {
  test("resolveActionDesignerForChatTurn requires scoped embed", () => {
    const ref = { entityId: "test2", isSubProgram: false };
    assert.equal(
      resolveActionDesignerForChatTurn({
        designerEmbedScoped: false,
        actionDesigner: ref,
      }),
      undefined,
    );
    assert.deepEqual(
      resolveActionDesignerForChatTurn({
        designerEmbedScoped: true,
        actionDesigner: ref,
      }),
      ref,
    );
  });

  test("parseActionDesignerChatContext accepts entity id", () => {
    const parsed = parseActionDesignerChatContext({
      entityId: "  abc-def  ",
      isSubProgram: true,
    });
    assert.deepEqual(parsed, { entityId: "abc-def", isSubProgram: true });
  });

  test("mergeDesignerDefaultActionScope adds designer default when no user @", () => {
    const merged = mergeDesignerDefaultActionScope(
      { pinnedLatestAll: [] },
      { entityId: "aaa-bbb", isSubProgram: false },
      "My Action",
    );
    assert.equal(merged.pinnedLatest?.id, "aaa-bbb");
    assert.equal(merged.pinnedLatest?.source, "designer-default");
    assert.equal(merged.pinnedLatestAll.length, 1);
  });

  test("formatDesignerEmbedContextForSystem names default edit target", () => {
    const block = formatDesignerEmbedContextForSystem(
      { entityId: "111-222", isSubProgram: false },
      {
        entityId: "111-222",
        title: "Demo",
        selectedSteps: [{ index: 0, note: "HTTP 请求" }],
      },
    );
    assert.match(block, /默认编辑下面这个程序/);
    assert.match(block, /entityId：`111-222`/);
    assert.match(block, /target=action/);
    assert.match(block, /步骤 1: HTTP 请求/);
  });
});
