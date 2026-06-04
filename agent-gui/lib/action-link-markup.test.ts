import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  finalizeAssistantRenderUnits,
  groupAssistantRenderUnits,
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

  it("groups consecutive links into one link-bar", () => {
    const text = [
      "已完成修改。\n",
      `<qka-link id="${GUID}" op="run">运行</qka-link>`,
      "\n",
      `<qka-link id="${GUID}" op="edit">Quicker 编辑</qka-link>`,
      "\n",
      `<qka-link id="${GUID}" op="float">悬浮</qka-link>`,
      "\n",
      `<qka-link id="${GUID}" op="workspace">工作区</qka-link>`,
    ].join("");
    const units = groupAssistantRenderUnits(parseAssistantMessageSegments(text));
    assert.equal(units.length, 2);
    assert.equal(units[0]?.kind, "markdown");
    assert.equal(units[1]?.kind, "link-bar");
    if (units[1]?.kind === "link-bar") {
      assert.equal(units[1].links.length, 4);
    }
  });

  it("finalize moves link-bar to the end", () => {
    const units = [
      { kind: "markdown" as const, text: "intro" },
      {
        kind: "link-bar" as const,
        links: [
          {
            actionId: GUID,
            op: "run" as const,
            label: "运行",
          },
        ],
      },
      { kind: "markdown" as const, text: "more text" },
    ];
    const out = finalizeAssistantRenderUnits(units);
    assert.equal(out.length, 3);
    assert.equal(out[0]?.kind, "markdown");
    assert.equal(out[1]?.kind, "markdown");
    assert.equal(out[2]?.kind, "link-bar");
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
