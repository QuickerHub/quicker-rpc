import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hasAssistantActionLinks,
  parseAssistantMessageSegments,
  parseActionLinkFromAttrs,
} from "./action-link-markup";

const GUID = "846b4132-ad73-42e8-b2f9-c42fe718ae20";

describe("action-link-markup", () => {
  it("detects qka-link tags", () => {
    assert.equal(hasAssistantActionLinks("plain text"), false);
    assert.equal(
      hasAssistantActionLinks(`<qka-link id="${GUID}" op="run">运行</qka-link>`),
      true,
    );
  });

  it("parses paired and self-closing links", () => {
    const text = `Done.\n<qka-link id="${GUID}" op="run">运行</qka-link> · <qka-link id="${GUID}" op="edit" label="编辑"/>`;
    const segments = parseAssistantMessageSegments(text);
    assert.equal(segments.length, 4);
    assert.equal(segments[0]?.type, "text");
    assert.equal(segments[1]?.type, "link");
    if (segments[1]?.type === "link") {
      assert.equal(segments[1].link.actionId, GUID);
      assert.equal(segments[1].link.op, "run");
      assert.equal(segments[1].link.label, "运行");
    }
    if (segments[2]?.type === "link") {
      assert.equal(segments[2].link.op, "edit");
      assert.equal(segments[2].link.label, "编辑");
    }
  });

  it("rejects invalid id or op", () => {
    assert.equal(
      parseActionLinkFromAttrs({ id: "not-a-guid", op: "run" }, ""),
      null,
    );
    assert.equal(
      parseActionLinkFromAttrs({ id: GUID, op: "delete" }, ""),
      null,
    );
  });
});
