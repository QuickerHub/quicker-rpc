import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDesignerMentionItems,
  formatDesignerStepMentionTitle,
  mergeDesignerMentionItems,
} from "@/lib/designer-mention-items";
import type { DesignerContextSnapshot } from "@/lib/designer-context-types";
import { formatActionQkaForModel } from "@/lib/action-qka-prompt";
import { expandUserMessageForModel, formatActionTagMarkup } from "@/lib/compose-user-message";

const snapshot: DesignerContextSnapshot = {
  ok: true,
  designers: [
    {
      entityId: "action-guid-1",
      title: "My Test Action",
      isActive: true,
      selectedSteps: [
        {
          index: 2,
          stepRunnerKey: "sys:http",
          note: "fetch api",
        },
        {
          index: 5,
          stepId: "step-id-5",
          stepRunnerKey: "sys:evalexpression",
        },
      ],
    },
  ],
};

describe("designer-mention-items", () => {
  it("puts current action first and selected steps next when query is empty", () => {
    const items = buildDesignerMentionItems(snapshot, "action-guid-1", false, "", 8);
    assert.equal(items.length, 3);
    assert.equal(items[0]?.designerPin, true);
    assert.equal(items[0]?.id, "action-guid-1");
    assert.equal(items[1]?.kind, "designer-step");
    assert.equal(items[1]?.stepIndex, 2);
    assert.equal(items[2]?.stepIndex, 5);
  });

  it("filters steps by runner key or note", () => {
    const items = buildDesignerMentionItems(snapshot, "action-guid-1", false, "http", 8);
    assert.equal(items.length, 1);
    assert.equal(items[0]?.kind, "designer-step");
    assert.equal(items[0]?.stepRunnerKey, "sys:http");
  });

  it("mergeDesignerMentionItems dedupes current action from remote search", () => {
    const designerItems = buildDesignerMentionItems(snapshot, "action-guid-1", false, "", 8);
    const merged = mergeDesignerMentionItems(
      designerItems,
      [
        { kind: "action", id: "action-guid-1", title: "Remote duplicate" },
        { kind: "action", id: "other-action", title: "Other" },
      ],
      "action-guid-1",
      8,
    );
    assert.equal(merged.length, 4);
    assert.equal(merged[0]?.designerPin, true);
    assert.ok(merged.every((item) => item.id !== "action-guid-1" || item.designerPin));
  });

  it("formatDesignerStepMentionTitle prefers note then runner", () => {
    assert.equal(
      formatDesignerStepMentionTitle({ index: 0, note: "hello", stepRunnerKey: "sys:http" }),
      "步骤 1: hello",
    );
    assert.equal(
      formatDesignerStepMentionTitle({ index: 3, stepRunnerKey: "sys:http" }),
      "步骤 4: sys:http",
    );
  });
});

describe("designer-step tag expansion", () => {
  it("round-trips designer-step markup to model qka", () => {
    const markup = formatActionTagMarkup({
      kind: "designer-step",
      id: "step-id-5",
      title: "步骤 6: sys:evalexpression",
      entityId: "action-guid-1",
      stepIndex: 5,
      stepId: "step-id-5",
      stepRunnerKey: "sys:evalexpression",
    });
    const expanded = expandUserMessageForModel(markup);
    assert.match(expanded, /kind="designer-step"/);
    assert.match(expanded, /action-id="action-guid-1"/);
    assert.match(expanded, /step-index="5"/);
    assert.match(expanded, /step-id="step-id-5"/);
    assert.match(expanded, /step-runner="sys:evalexpression"/);
  });

  it("formatActionQkaForModel includes subprogram target", () => {
    const qka = formatActionQkaForModel({
      kind: "designer-step",
      id: "s1",
      title: "步骤 1",
      entityId: "sp-guid",
      stepIndex: 0,
      isSubProgram: true,
    });
    assert.match(qka, /target="subprogram"/);
  });
});
